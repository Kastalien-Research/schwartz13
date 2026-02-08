import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
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

  const totalSteps = 2 + expandTop + 1; // search + N expansions + deduplicate

  // Step 1: Initial search
  store.updateProgress(taskId, { step: 'searching', completed: 1, total: totalSteps });
  const searchResponse = await exa.search(query, searchOpts as any);
  const initialResults = (searchResponse as any).results ?? [];

  if (isCancelled(taskId, store)) return null;

  // Step 2-N: Expand top results via findSimilar
  const expandCount = Math.min(expandTop, initialResults.length);
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

registerWorkflow('retrieval.expandAndCollect', expandAndCollectWorkflow);
