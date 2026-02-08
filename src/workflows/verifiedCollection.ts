import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { Semaphore } from '../lib/semaphore.js';
import { registerWorkflow } from './types.js';
import {
  createStepTracker,
  isCancelled,
  pollUntilIdle,
  collectItems,
  summarizeItem,
  validateRequired,
  validateEntity,
  withSummary,
} from './helpers.js';

// --- Template expansion ---

export function expandTemplate(
  template: string,
  item: Record<string, unknown>,
): string {
  const props = item.properties as Record<string, unknown> | undefined;
  const company = props?.company as Record<string, unknown> | undefined;
  const person = props?.person as Record<string, unknown> | undefined;
  const article = props?.article as Record<string, unknown> | undefined;

  const name = (company?.name ?? person?.name ?? article?.title ?? props?.description ?? 'unknown') as string;
  const url = (props?.url ?? '') as string;
  const description = (props?.description ?? summarizeItem(item)) as string;

  return template
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{url\}\}/g, url)
    .replace(/\{\{description\}\}/g, description);
}

// --- Main Workflow ---

async function verifiedCollectionWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();
  const tracker = createStepTracker();

  const criteria = args.criteria as Array<{ description: string }> | undefined;
  const count = (args.count as number) ?? 25;
  const enrichments = args.enrichments as Array<Record<string, unknown>> | undefined;
  const researchSchema = args.researchSchema as object | undefined;
  const researchModel = (args.researchModel as string) ?? 'exa-research';
  const researchLimit = (args.researchLimit as number) ?? 10;
  const timeoutMs = (args.timeout as number) ?? 300_000;

  // Validate
  const step0 = Date.now();
  validateRequired(args, 'query', 'Natural language search query, e.g. "AI startups in San Francisco"');
  const entity = validateEntity(args.entity);
  validateRequired(args, 'researchPrompt', 'Template for per-entity research, e.g. "Research {{name}} and describe their main product"');
  const query = args.query as string;
  const researchPrompt = args.researchPrompt as string;
  tracker.track('validate', step0);

  if (isCancelled(taskId, store)) return null;

  // Create webset
  const step1 = Date.now();
  store.updateProgress(taskId, { step: 'creating webset', completed: 1, total: 5 });

  const createParams: Record<string, unknown> = {
    search: { query, count, entity },
  };
  if (criteria) (createParams.search as any).criteria = criteria;
  if (enrichments) createParams.enrichments = enrichments;

  const webset = await exa.websets.create(createParams as any);
  const websetId = webset.id;
  tracker.track('create', step1);

  if (isCancelled(taskId, store)) {
    await exa.websets.cancel(websetId);
    return null;
  }

  // Poll until idle
  const step2 = Date.now();
  store.updateProgress(taskId, { step: 'polling', completed: 2, total: 5 });

  await pollUntilIdle({
    exa,
    websetId,
    taskId,
    store,
    timeoutMs,
    stepNum: 2,
    totalSteps: 5,
  });
  tracker.track('poll', step2);

  if (isCancelled(taskId, store)) return null;

  // Collect items
  const step3 = Date.now();
  store.updateProgress(taskId, { step: 'collecting', completed: 3, total: 5 });
  const allItems = await collectItems(exa, websetId, count * 2);
  tracker.track('collect', step3);

  // Select top N items for research
  const selectedItems = allItems.slice(0, researchLimit);

  store.setPartialResult(taskId, {
    websetId,
    totalItems: allItems.length,
    selectedForResearch: selectedItems.length,
  });

  if (isCancelled(taskId, store)) return null;

  // Run per-entity research with concurrency limit
  const step4 = Date.now();
  store.updateProgress(taskId, {
    step: 'researching',
    completed: 4,
    total: 5,
    message: `Researching ${selectedItems.length} entities`,
  });

  const semaphore = new Semaphore(3);
  const researchResults = await Promise.all(
    selectedItems.map((item, idx) =>
      semaphore.run(async () => {
        if (isCancelled(taskId, store)) return { item, research: undefined };

        const instructions = expandTemplate(researchPrompt, item);
        const researchStart = Date.now();

        try {
          const params: Record<string, unknown> = { instructions, model: researchModel };
          if (researchSchema) params.outputSchema = researchSchema;

          const resp = await (exa.research as any).create(params);
          const researchId = resp.researchId ?? resp.id;
          const result = await (exa.research as any).pollUntilFinished(researchId, {
            timeoutMs: Math.min(timeoutMs, 120_000),
          });

          store.updateProgress(taskId, {
            step: 'researching',
            completed: 4,
            total: 5,
            message: `Completed ${idx + 1}/${selectedItems.length}`,
          });

          return {
            item,
            research: {
              researchId,
              result: result.output ?? result.result ?? result,
              duration: Date.now() - researchStart,
            },
          };
        } catch (err) {
          return {
            item,
            research: {
              researchId: 'error',
              result: `Research failed: ${err instanceof Error ? err.message : String(err)}`,
              duration: Date.now() - researchStart,
            },
          };
        }
      }),
    ),
  );
  tracker.track('research', step4);

  store.updateProgress(taskId, { step: 'complete', completed: 5, total: 5 });

  const researchedCount = researchResults.filter(
    r => r.research && r.research.researchId !== 'error',
  ).length;

  const duration = Date.now() - startTime;
  const succeededCount = researchResults.filter(r => r.research && r.research.researchId !== 'error').length;

  return withSummary({
    websetId,
    items: researchResults,
    totalItems: allItems.length,
    researchedCount,
    duration,
    steps: tracker.steps,
  }, `${allItems.length} items collected, ${selectedItems.length} researched (${succeededCount} succeeded) in ${(duration / 1000).toFixed(0)}s`);
}

registerWorkflow('research.verifiedCollection', verifiedCollectionWorkflow);
