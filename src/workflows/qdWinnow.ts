import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import {
  type StepTiming,
  createStepTracker,
  isCancelled,
  sleep,
  summarizeItem,
  collectItems,
  withSummary,
} from './helpers.js';

// --- Types ---

interface QdWinnowArgs {
  query?: string;
  entity: { type: string };
  criteria: Array<{ description: string }>;
  enrichments: Array<{
    description: string;
    format?: string;
    options?: Array<{ label: string }>;
  }>;
  count?: number;
  seedWebsetId?: string;
  timeout?: number;
  critique?: boolean;
  selectionStrategy?: 'all-criteria' | 'any-criteria' | 'diverse';
}

export interface ClassifiedItem {
  item: Record<string, unknown>;
  niche: string;
  criteriaVector: boolean[];
  fitnessScore: number;
}

// --- Helpers (exported for testing) ---

export function classifyItem(
  item: Record<string, unknown>,
  criteriaDescs: string[],
): { niche: string; vector: boolean[] } {
  const evaluations = (item.evaluations as Array<{ criterion: string; satisfied: string }>) ?? [];
  const vector = criteriaDescs.map(desc => {
    const evaluation = evaluations.find(e => e.criterion === desc);
    return evaluation?.satisfied === 'yes';
  });
  const niche = vector.map(v => (v ? '1' : '0')).join(',');
  return { niche, vector };
}

export function scoreEnrichment(e: {
  format: string;
  result: string[] | null;
  status: string;
}): number {
  if (e.status !== 'completed' || e.result === null || e.result.length === 0) return 0;

  switch (e.format) {
    case 'number': {
      const num = parseFloat(e.result[0]);
      return isNaN(num) ? 0 : num;
    }
    case 'options':
      return e.result.length > 0 ? 1 : 0;
    case 'text':
    case 'date':
    case 'email':
    case 'phone':
    case 'url':
      return e.result.length > 0 && e.result[0].length > 0 ? 1 : 0;
    default:
      return 0;
  }
}

export function scoreItem(item: Record<string, unknown>): number {
  const enrichments = (item.enrichments as Array<{
    format: string;
    result: string[] | null;
    status: string;
  }>) ?? [];
  const completed = enrichments.filter(
    e => e.status === 'completed' && e.result !== null,
  );
  if (completed.length === 0) return 0;
  const scores = completed.map(e => scoreEnrichment(e));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function selectElites(
  classified: ClassifiedItem[],
  strategy: 'all-criteria' | 'any-criteria' | 'diverse',
): ClassifiedItem[] {
  if (classified.length === 0) return [];

  switch (strategy) {
    case 'all-criteria': {
      const fullKey = classified[0].criteriaVector.map(() => '1').join(',');
      return classified
        .filter(c => c.niche === fullKey)
        .sort((a, b) => b.fitnessScore - a.fitnessScore);
    }
    case 'any-criteria': {
      const zeroKey = classified[0].criteriaVector.map(() => '0').join(',');
      return classified
        .filter(c => c.niche !== zeroKey)
        .sort((a, b) => b.fitnessScore - a.fitnessScore);
    }
    case 'diverse':
    default: {
      const niches = new Map<string, ClassifiedItem>();
      for (const c of classified) {
        const existing = niches.get(c.niche);
        if (!existing || c.fitnessScore > existing.fitnessScore) {
          niches.set(c.niche, c);
        }
      }
      return [...niches.values()].sort((a, b) => b.fitnessScore - a.fitnessScore);
    }
  }
}

// Re-export summarizeItem for backward compatibility with existing tests
export { summarizeItem } from './helpers.js';

// --- Main Workflow ---

async function qdWinnowWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();
  const tracker = createStepTracker();
  const { steps } = tracker;
  const trackStep = tracker.track.bind(tracker);

  // Parse args
  const a: QdWinnowArgs = {
    query: args.query as string | undefined,
    entity: args.entity as { type: string },
    criteria: args.criteria as Array<{ description: string }>,
    enrichments: args.enrichments as Array<{
      description: string;
      format?: string;
      options?: Array<{ label: string }>;
    }>,
    count: args.count as number | undefined,
    seedWebsetId: args.seedWebsetId as string | undefined,
    timeout: args.timeout as number | undefined,
    critique: args.critique as boolean | undefined,
    selectionStrategy: args.selectionStrategy as
      | 'all-criteria'
      | 'any-criteria'
      | 'diverse'
      | undefined,
  };

  const strategy = ['all-criteria', 'any-criteria', 'diverse'].includes(
    a.selectionStrategy as string,
  )
    ? a.selectionStrategy!
    : 'diverse';

  // Step 0: Validate
  const step0Start = Date.now();
  store.updateProgress(taskId, { step: 'initializing', completed: 0, total: 7 });

  if (!a.criteria || a.criteria.length === 0) {
    throw new Error('criteria is required and must be non-empty');
  }
  if (a.criteria.length > 10) {
    throw new Error('criteria must have at most 10 entries');
  }
  if (!a.enrichments || a.enrichments.length === 0) {
    throw new Error('enrichments is required and must be non-empty');
  }
  if (!a.query && !a.seedWebsetId) {
    throw new Error('query is required unless seedWebsetId is provided');
  }
  trackStep('validate', step0Start);

  if (isCancelled(taskId, store)) {
    return null;
  }

  // Step 1: Create or append to webset
  const step1Start = Date.now();
  store.updateProgress(taskId, { step: 'creating', completed: 1, total: 7 });

  let websetId: string;
  if (a.seedWebsetId) {
    websetId = a.seedWebsetId;
    if (a.query) {
      await (exa.websets.searches as any).create(websetId, {
        query: a.query,
        count: a.count ?? 50,
        criteria: a.criteria,
        entity: a.entity,
        behavior: 'append',
      });
    }
    for (const enrichment of a.enrichments) {
      await (exa.websets.enrichments as any).create(websetId, enrichment);
    }
  } else {
    const webset = await exa.websets.create({
      search: {
        query: a.query!,
        count: a.count ?? 50,
        criteria: a.criteria,
        entity: a.entity,
      },
      enrichments: a.enrichments,
    } as any);
    websetId = webset.id;
  }
  trackStep('create', step1Start);

  if (isCancelled(taskId, store)) {
    await exa.websets.cancel(websetId);
    return null;
  }

  // Step 2: Poll until idle
  const step2Start = Date.now();
  const timeoutMs = a.timeout ?? 300_000;
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  let webset: any;

  while (true) {
    webset = await exa.websets.get(websetId);
    if (webset.status === 'idle') break;
    if (webset.status === 'paused') {
      throw new Error('Webset was paused unexpectedly');
    }

    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }

    const searches = webset.searches as any[] | undefined;
    const lastSearch = searches?.[searches.length - 1];
    if (lastSearch?.progress) {
      const prog = lastSearch.progress;
      const stringency =
        prog.analyzed > 0 ? prog.found / prog.analyzed : 0;
      store.updateProgress(taskId, {
        step: 'searching',
        completed: 2,
        total: 7,
        message: `Found ${prog.found}/${prog.analyzed} analyzed (stringency: ${(stringency * 100).toFixed(1)}%)`,
      });
    }

    if (isCancelled(taskId, store)) {
      await exa.websets.cancel(websetId);
      return null;
    }

    await sleep(2000);
  }
  trackStep('poll', step2Start);

  if (isCancelled(taskId, store)) {
    await exa.websets.cancel(websetId);
    return null;
  }

  // Step 3: Collect items
  const step3Start = Date.now();
  store.updateProgress(taskId, { step: 'collecting', completed: 3, total: 7 });

  const items = await collectItems(exa, websetId);
  trackStep('collect', step3Start);

  // Set partial result checkpoint
  store.setPartialResult(taskId, { websetId, itemCount: items.length, items });

  if (isCancelled(taskId, store)) {
    return null;
  }

  // Step 4: Classify into niches
  const step4Start = Date.now();
  store.updateProgress(taskId, { step: 'classifying', completed: 4, total: 7 });

  const criteriaDescs = a.criteria.map(c => c.description);
  const classified: ClassifiedItem[] = items.map(item => {
    const { niche, vector } = classifyItem(item, criteriaDescs);
    const fitnessScore = scoreItem(item);
    return { item, niche, criteriaVector: vector, fitnessScore };
  });
  trackStep('classify', step4Start);

  // Step 5: Score fitness (done inline in step 4)
  store.updateProgress(taskId, { step: 'scoring', completed: 5, total: 7 });

  // Step 6: Select elites
  const step6Start = Date.now();
  store.updateProgress(taskId, { step: 'selecting', completed: 6, total: 7 });

  const elites = selectElites(classified, strategy);
  trackStep('select', step6Start);

  // Step 7: Compute metrics
  const step7Start = Date.now();
  const numCriteria = a.criteria.length;
  const possibleNiches = Math.pow(2, numCriteria);
  const populatedNicheSet = new Set(classified.map(c => c.niche));
  const populatedNiches = populatedNicheSet.size;

  const nicheDistribution: Record<string, number> = {};
  for (const c of classified) {
    nicheDistribution[c.niche] = (nicheDistribution[c.niche] ?? 0) + 1;
  }

  // Shannon entropy for diversity
  const total = classified.length;
  let entropy = 0;
  if (total > 0) {
    entropy = Object.values(nicheDistribution).reduce((sum, count) => {
      const p = count / total;
      return sum - (p > 0 ? p * Math.log2(p) : 0);
    }, 0);
  }
  const maxEntropy = Math.log2(possibleNiches);
  const diversity = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // Refresh webset for final search data
  if (!webset || timedOut) {
    webset = await exa.websets.get(websetId);
  }
  const searches = webset.searches as any[] | undefined;
  const lastSearch = searches?.[searches.length - 1];
  const searchProgress = lastSearch?.progress;
  const stringency = searchProgress
    ? searchProgress.found / Math.max(searchProgress.analyzed, 1)
    : 0;

  const descriptorFeedback = (lastSearch?.criteria ?? []).map(
    (c: { description: string; successRate: number }) => ({
      criterion: c.description,
      successRate: c.successRate,
      quality:
        c.successRate < 5
          ? ('too-strict' as const)
          : c.successRate > 95
            ? ('not-discriminating' as const)
            : ('good-discriminator' as const),
    }),
  );

  const qualityMetrics = {
    coverage: populatedNiches / possibleNiches,
    avgFitness:
      elites.length > 0
        ? elites.reduce((s, e) => s + e.fitnessScore, 0) / elites.length
        : 0,
    diversity,
    stringency,
  };
  trackStep('metrics', step7Start);

  // Step 8 (optional): Critique
  let critique: { researchId: string; content: string } | undefined;
  if (a.critique) {
    const step8Start = Date.now();
    store.updateProgress(taskId, {
      step: 'critiquing',
      completed: 7,
      total: 7,
      message: 'Running Research API critique...',
    });

    try {
      const critiqueInstructions = `Given the research query "${a.query}" targeting ${a.entity.type} entities, and ${items.length} results classified into ${populatedNiches} niches:

Top elites:
${elites
  .slice(0, 10)
  .map(
    e =>
      `- [${e.niche}] fitness=${e.fitnessScore.toFixed(2)}: ${summarizeItem(e.item)}`,
  )
  .join('\n')}

Quality metrics: coverage=${qualityMetrics.coverage.toFixed(2)}, avgFitness=${qualityMetrics.avgFitness.toFixed(2)}, diversity=${diversity.toFixed(2)}, stringency=${stringency.toFixed(3)}

Assess:
1. Coverage: are important entity types/niches missing?
2. Quality: are the top results genuinely relevant?
3. Gaps: what blind spots exist in the criteria?
4. Surprises: anything unexpected that deserves deeper investigation?`;

      const researchResp = await (exa.research as any).create({
        instructions: critiqueInstructions,
        model: 'exa-research-fast',
      });
      const critiqueResult = await (exa.research as any).pollUntilFinished(
        researchResp.researchId ?? researchResp.id,
        { timeoutMs: 120_000 },
      );
      critique = {
        researchId: researchResp.researchId ?? researchResp.id,
        content:
          critiqueResult.output ?? critiqueResult.result ?? JSON.stringify(critiqueResult),
      };
    } catch (err) {
      critique = {
        researchId: 'error',
        content: `Critique failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    trackStep('critique', step8Start);
  }

  const duration = Date.now() - startTime;
  const result: Record<string, unknown> = {
    websetId,
    itemCount: items.length,
    nicheDistribution,
    elites,
    qualityMetrics,
    descriptorFeedback,
    duration,
    steps,
  };
  if (timedOut) {
    result.timedOut = true;
  }
  if (critique) {
    result.critique = critique;
  }

  return withSummary(result, `${items.length} items → ${populatedNiches}/${possibleNiches} niches populated, ${elites.length} elites selected (${strategy}), coverage=${qualityMetrics.coverage.toFixed(2)} in ${(duration / 1000).toFixed(0)}s`);
}

// Register
registerWorkflow('qd.winnow', qdWinnowWorkflow);
