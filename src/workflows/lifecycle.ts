import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import {
  createStepTracker,
  isCancelled,
  pollUntilIdle,
  collectItems,
} from './helpers.js';

async function lifecycleHarvestWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();
  const tracker = createStepTracker();

  const query = args.query as string | undefined;
  const entity = args.entity as { type: string } | undefined;
  const criteria = args.criteria as Array<{ description: string }> | undefined;
  const count = (args.count as number) ?? 25;
  const enrichments = args.enrichments as Array<Record<string, unknown>> | undefined;
  const timeoutMs = (args.timeout as number) ?? 300_000;
  const cleanup = (args.cleanup as boolean) ?? false;

  // Validate
  const step0 = Date.now();
  if (!query) throw new Error('query is required');
  if (!entity) throw new Error('entity is required');
  tracker.track('validate', step0);

  if (isCancelled(taskId, store)) return null;

  // Create webset with search + enrichments
  const step1 = Date.now();
  store.updateProgress(taskId, { step: 'creating', completed: 1, total: 4 });

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
  store.updateProgress(taskId, { step: 'polling', completed: 2, total: 4 });

  const { webset: finalWebset, timedOut } = await pollUntilIdle({
    exa,
    websetId,
    taskId,
    store,
    timeoutMs,
    stepNum: 2,
    totalSteps: 4,
  });
  tracker.track('poll', step2);

  if (isCancelled(taskId, store)) return null;

  // Collect items
  const step3 = Date.now();
  store.updateProgress(taskId, { step: 'collecting', completed: 3, total: 4 });

  const items = await collectItems(exa, websetId, count * 2);
  tracker.track('collect', step3);

  // Cleanup if requested
  if (cleanup) {
    try {
      await (exa.websets as any).delete(websetId);
    } catch {
      // best-effort cleanup
    }
  }

  // Extract search progress
  const searches = finalWebset?.searches as any[] | undefined;
  const lastSearch = searches?.[searches.length - 1];
  const searchProgress = lastSearch?.progress
    ? { found: lastSearch.progress.found, analyzed: lastSearch.progress.analyzed }
    : null;

  const enrichmentCount = enrichments?.length ?? 0;

  store.updateProgress(taskId, { step: 'complete', completed: 4, total: 4 });

  const result: Record<string, unknown> = {
    websetId,
    items,
    itemCount: items.length,
    searchProgress,
    enrichmentCount,
    duration: Date.now() - startTime,
    steps: tracker.steps,
  };
  if (timedOut) result.timedOut = true;

  return result;
}

registerWorkflow('lifecycle.harvest', lifecycleHarvestWorkflow);
