import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow, type WorkflowMeta } from './types.js';
import {
  createStepTracker,
  isCancelled,
  pollUntilIdle,
  collectItems,
  validateRequired,
  validateEntity,
  withSummary,
} from './helpers.js';
import { filterAndProjectItems } from '../lib/projections.js';

async function lifecycleHarvestWorkflow(
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
  const timeoutMs = (args.timeout as number) ?? 300_000;
  const cleanup = (args.cleanup as boolean) ?? false;

  // Validate
  const step0 = Date.now();
  validateRequired(args, 'query', 'Natural language search query, e.g. "AI startups in San Francisco"');
  const entity = validateEntity(args.entity);
  const query = args.query as string;
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

  const duration = Date.now() - startTime;
  const projected = filterAndProjectItems(items);
  const result: Record<string, unknown> = {
    websetId,
    items: projected.data,
    itemCount: projected.included,
    itemsExcluded: projected.excluded,
    searchProgress,
    enrichmentCount,
    duration,
    steps: tracker.steps,
  };
  if (timedOut) result.timedOut = true;

  return withSummary(result, `Harvested ${projected.included} items (${projected.excluded} excluded) from webset ${websetId} (${enrichmentCount} enrichments) in ${(duration / 1000).toFixed(0)}s`);
}

const meta: WorkflowMeta = {
  title: 'Lifecycle Harvest',
  description: 'The foundational create-poll-collect webset lifecycle. Creates a webset with search criteria and enrichments, waits for completion, and returns all items. The pattern that more complex workflows build on.',
  category: 'lifecycle',
  parameters: [
    { name: 'query', type: 'string', required: true, description: 'Natural language search query' },
    { name: 'entity', type: 'object', required: true, description: 'Entity type: { type: "company" | "person" | "article" }' },
    { name: 'criteria', type: 'array', required: false, description: 'Filtering criteria for the search' },
    { name: 'enrichments', type: 'array', required: false, description: 'Enrichments to add to the webset' },
    { name: 'count', type: 'number', required: false, description: 'Max search results', default: 25 },
    { name: 'cleanup', type: 'boolean', required: false, description: 'Delete webset after collecting items', default: false },
    { name: 'timeout', type: 'number', required: false, description: 'Timeout in milliseconds', default: 300000 },
  ],
  steps: [
    'Validate query and entity type',
    'Create webset with search criteria and enrichments',
    'Poll until webset is idle or timeout',
    'Collect all items from the webset',
    'Optionally delete the webset (cleanup)',
  ],
  output: 'Webset ID, projected items, item count, items excluded, search progress, enrichment count, and duration.',
  example: `await callOperation('tasks.create', {\n  type: 'lifecycle.harvest',\n  args: {\n    query: 'AI startups in San Francisco',\n    entity: { type: 'company' },\n    criteria: [{ description: 'Founded after 2020' }],\n    enrichments: [{ description: 'Number of employees', format: 'number' }],\n    count: 25,\n  }\n});`,
  relatedWorkflows: ['qd.winnow', 'convergent.search', 'verify.enrichments'],
  tags: ['lifecycle', 'harvest', 'collect', 'webset', 'foundational', 'create-poll-collect'],
};

registerWorkflow('lifecycle.harvest', lifecycleHarvestWorkflow, meta);
