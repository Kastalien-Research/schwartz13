import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow, type WorkflowMeta } from './types.js';
import { isCancelled, validateRequired, withSummary } from './helpers.js';

async function expandAndCollectWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();

  // Validate & extract args
  validateRequired(args, 'query', 'Search query string');
  const query = args.query as string;
  const numResults = (args.numResults as number) ?? 5;
  const expandTop = (args.expandTop as number) ?? 3;

  // Build search options
  const searchOpts: Record<string, unknown> = { numResults };
  if (args.category) searchOpts.category = args.category;
  if (args.startPublishedDate) searchOpts.startPublishedDate = args.startPublishedDate;
  if (args.endPublishedDate) searchOpts.endPublishedDate = args.endPublishedDate;

  // Step 1: Initial search (use expandTop as estimate before we know actual count)
  store.updateProgress(taskId, { step: 'searching', completed: 1, total: 2 + expandTop + 1 });
  const searchResponse = await exa.search(query, searchOpts as any);
  const initialResults = (searchResponse as any).results ?? [];

  if (isCancelled(taskId, store)) return null;

  // Step 2-N: Expand top results via findSimilar
  const expandCount = Math.min(expandTop, initialResults.length);
  const totalSteps = 2 + expandCount + 1; // search + actual expansions + deduplicate
  const expandedResults: any[][] = [];

  for (let i = 0; i < expandCount; i++) {
    const url = initialResults[i]?.url;
    if (!url) continue;

    store.updateProgress(taskId, {
      step: `expanding ${i + 1}/${expandCount}`,
      completed: 2 + i,
      total: totalSteps,
      message: `findSimilar on ${url}`,
    });

    const similarResponse = await exa.findSimilar(url, { numResults } as any);
    expandedResults.push((similarResponse as any).results ?? []);

    if (isCancelled(taskId, store)) return null;
  }

  // Deduplicate by URL
  store.updateProgress(taskId, { step: 'deduplicating', completed: totalSteps - 1, total: totalSteps });

  const seen = new Set<string>();
  const deduplicated: any[] = [];

  // Add initial results first
  for (const r of initialResults) {
    if (r.url && !seen.has(r.url)) {
      seen.add(r.url);
      deduplicated.push({ ...r, source: 'initial' });
    }
  }

  // Add expanded results
  for (let i = 0; i < expandedResults.length; i++) {
    for (const r of expandedResults[i]) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url);
        deduplicated.push({ ...r, source: `expanded-from-${i}` });
      }
    }
  }

  store.updateProgress(taskId, { step: 'complete', completed: totalSteps, total: totalSteps });

  const duration = Date.now() - startTime;
  const totalExpanded = expandedResults.reduce((sum, arr) => sum + arr.length, 0);

  return withSummary({
    query,
    initialCount: initialResults.length,
    expandedCount: totalExpanded,
    deduplicatedCount: deduplicated.length,
    results: deduplicated.map((r: any) => ({
      title: r.title,
      url: r.url,
      score: r.score,
      source: r.source,
    })),
    duration,
  }, `"${query}" → ${initialResults.length} initial + ${totalExpanded} expanded = ${deduplicated.length} unique in ${(duration / 1000).toFixed(1)}s`);
}

const meta: WorkflowMeta = {
  title: 'Expand and Collect',
  description: 'Start with a search, then expand coverage by finding similar pages for the top results. Deduplicates by URL. Good for discovering content beyond what a single search query returns.',
  category: 'retrieval',
  parameters: [
    { name: 'query', type: 'string', required: true, description: 'Search query string' },
    { name: 'numResults', type: 'number', required: false, description: 'Results per search', default: 5 },
    { name: 'expandTop', type: 'number', required: false, description: 'Number of top results to expand via findSimilar', default: 3 },
    { name: 'category', type: 'string', required: false, description: 'Content category filter' },
    { name: 'startPublishedDate', type: 'string', required: false, description: 'Only include pages published after this date' },
    { name: 'endPublishedDate', type: 'string', required: false, description: 'Only include pages published before this date' },
  ],
  steps: [
    'Run initial Exa search with query and filters',
    'For each of the top N results, run findSimilar to discover related pages',
    'Deduplicate all results by URL',
  ],
  output: 'Deduplicated results with title, URL, score, and source tracking (initial vs expanded-from-N).',
  example: `await callOperation('tasks.create', {\n  type: 'retrieval.expandAndCollect',\n  args: {\n    query: 'MCP server implementations',\n    numResults: 5,\n    expandTop: 3,\n  }\n});`,
  relatedWorkflows: ['retrieval.searchAndRead'],
  tags: ['search', 'expand', 'similar', 'discover', 'breadth', 'dedup'],
};

registerWorkflow('retrieval.expandAndCollect', expandAndCollectWorkflow, meta);
