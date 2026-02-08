import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import {
  createStepTracker,
  isCancelled,
  pollUntilIdle,
  collectItems,
  validateQueries,
  validateEntity,
  withSummary,
} from './helpers.js';
import { projectItem } from '../lib/projections.js';

// --- Deduplication helpers (exported for testing) ---

export function diceCoefficient(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const bigramsA = bigrams(na);
  const bigramsB = bigrams(nb);
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

interface DeduplicatedEntity {
  url: string;
  name: string;
  item: Record<string, unknown>;
  queryIndices: number[];
}

export interface DeduplicationResult {
  intersection: DeduplicatedEntity[];
  unique: DeduplicatedEntity[];
}

function getItemUrl(item: Record<string, unknown>): string {
  const props = item.properties as Record<string, unknown> | undefined;
  return (props?.url as string) ?? '';
}

function getItemName(item: Record<string, unknown>): string {
  const props = item.properties as Record<string, unknown> | undefined;
  if (!props) return '';
  const company = props.company as Record<string, unknown> | undefined;
  const person = props.person as Record<string, unknown> | undefined;
  const article = props.article as Record<string, unknown> | undefined;
  return ((company?.name ?? person?.name ?? article?.title ?? props.description ?? '') as string);
}

export function deduplicateItems(
  itemsByQuery: Array<Record<string, unknown>[]>,
): DeduplicationResult {
  const entities: DeduplicatedEntity[] = [];

  for (let qi = 0; qi < itemsByQuery.length; qi++) {
    for (const item of itemsByQuery[qi]) {
      const url = getItemUrl(item);
      const name = getItemName(item);

      // Try to find existing match
      let matched = false;
      for (const existing of entities) {
        // URL exact match
        if (url && existing.url && url === existing.url) {
          existing.queryIndices.push(qi);
          matched = true;
          break;
        }
        // Name fuzzy match
        if (name && existing.name && diceCoefficient(name, existing.name) > 0.85) {
          existing.queryIndices.push(qi);
          matched = true;
          break;
        }
      }

      if (!matched) {
        entities.push({ url, name, item, queryIndices: [qi] });
      }
    }
  }

  // Deduplicate query indices
  for (const e of entities) {
    e.queryIndices = [...new Set(e.queryIndices)];
  }

  const intersection = entities.filter(e => e.queryIndices.length >= 2);
  const unique = entities.filter(e => e.queryIndices.length === 1);

  return { intersection, unique };
}

// --- Main Workflow ---

async function convergentSearchWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();
  const tracker = createStepTracker();

  const criteria = args.criteria as Array<{ description: string }> | undefined;
  const count = (args.count as number) ?? 25;
  const timeoutMs = (args.timeout as number) ?? 300_000;

  // Validate
  const step0 = Date.now();
  const queries = validateQueries(args.queries);
  const entity = validateEntity(args.entity);
  tracker.track('validate', step0);

  if (isCancelled(taskId, store)) return null;

  const totalSteps = 2 + queries.length * 2 + 1; // validate + create*N + poll*N + analyze

  // Create websets sequentially
  const websetIds: string[] = [];
  for (let i = 0; i < queries.length; i++) {
    const stepStart = Date.now();
    store.updateProgress(taskId, {
      step: `creating webset ${i + 1}/${queries.length}`,
      completed: 1 + i,
      total: totalSteps,
    });

    const createParams: Record<string, unknown> = {
      search: { query: queries[i], count, entity },
    };
    if (criteria) (createParams.search as any).criteria = criteria;

    const webset = await exa.websets.create(createParams as any);
    websetIds.push(webset.id);
    tracker.track(`create-${i}`, stepStart);

    if (isCancelled(taskId, store)) {
      for (const id of websetIds) {
        await exa.websets.cancel(id);
      }
      return null;
    }
  }

  // Poll all until idle, sequentially
  for (let i = 0; i < websetIds.length; i++) {
    const stepStart = Date.now();
    const stepNum = 1 + queries.length + i;
    store.updateProgress(taskId, {
      step: `polling webset ${i + 1}/${queries.length}`,
      completed: stepNum,
      total: totalSteps,
    });

    await pollUntilIdle({
      exa,
      websetId: websetIds[i],
      taskId,
      store,
      timeoutMs,
      stepNum,
      totalSteps,
    });
    tracker.track(`poll-${i}`, stepStart);

    if (isCancelled(taskId, store)) return null;
  }

  // Collect items from all websets
  const stepCollect = Date.now();
  store.updateProgress(taskId, {
    step: 'collecting and deduplicating',
    completed: totalSteps - 1,
    total: totalSteps,
  });

  const itemsByQuery: Array<Record<string, unknown>[]> = [];
  for (const websetId of websetIds) {
    const items = await collectItems(exa, websetId, count * 2);
    itemsByQuery.push(items);
  }

  // Deduplicate
  const { intersection, unique } = deduplicateItems(itemsByQuery);

  // Compute overlap matrix
  const n = queries.length;
  const overlapMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  for (const entity of intersection) {
    const indices = entity.queryIndices;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        overlapMatrix[indices[i]][indices[j]]++;
        overlapMatrix[indices[j]][indices[i]]++;
      }
    }
  }

  tracker.track('collect-deduplicate', stepCollect);

  store.updateProgress(taskId, { step: 'complete', completed: totalSteps, total: totalSteps });

  const duration = Date.now() - startTime;
  const totalUnique = intersection.length + unique.length;
  const overlapPct = totalUnique > 0 ? Math.round((intersection.length / totalUnique) * 100) : 0;

  return withSummary({
    websetIds,
    queries,
    intersection: intersection.map(e => ({
      name: e.name,
      url: e.url,
      item: projectItem(e.item),
      foundInQueries: e.queryIndices.map(i => queries[i]),
      confidence: e.queryIndices.length / queries.length,
    })),
    unique: unique.map(e => ({
      query: queries[e.queryIndices[0]],
      item: projectItem(e.item),
    })),
    overlapMatrix,
    totalUniqueEntities: totalUnique,
    duration,
    steps: tracker.steps,
  }, `${queries.length} queries → ${totalUnique} unique entities, ${intersection.length} in intersection (${overlapPct}% overlap) in ${(duration / 1000).toFixed(0)}s`);
}

registerWorkflow('convergent.search', convergentSearchWorkflow);
