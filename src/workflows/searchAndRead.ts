import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import { isCancelled, validateRequired, withSummary } from './helpers.js';

async function searchAndReadWorkflow(
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

  // Build search options
  const searchOpts: Record<string, unknown> = { numResults };
  if (args.type) searchOpts.type = args.type;
  if (args.category) searchOpts.category = args.category;
  if (args.includeDomains) searchOpts.includeDomains = args.includeDomains;
  if (args.excludeDomains) searchOpts.excludeDomains = args.excludeDomains;
  if (args.startCrawlDate) searchOpts.startCrawlDate = args.startCrawlDate;
  if (args.endCrawlDate) searchOpts.endCrawlDate = args.endCrawlDate;
  if (args.startPublishedDate) searchOpts.startPublishedDate = args.startPublishedDate;
  if (args.endPublishedDate) searchOpts.endPublishedDate = args.endPublishedDate;

  // Step 1: Search
  store.updateProgress(taskId, { step: 'searching', completed: 1, total: 3 });
  const searchResponse = await exa.search(query, searchOpts as any);
  const results = (searchResponse as any).results ?? [];

  if (isCancelled(taskId, store)) return null;

  // Step 2: Get contents for top results
  store.updateProgress(taskId, { step: 'reading contents', completed: 2, total: 3, message: `Reading ${results.length} pages` });
  const urls = results.map((r: any) => r.url).filter(Boolean) as string[];

  let contents: any[] = [];
  if (urls.length > 0) {
    const contentsResponse = await exa.getContents(urls, { text: true, highlights: true } as any);
    contents = (contentsResponse as any).results ?? [];
  }

  if (isCancelled(taskId, store)) return null;

  // Step 3: Complete
  store.updateProgress(taskId, { step: 'complete', completed: 3, total: 3 });

  const duration = Date.now() - startTime;
  return withSummary({
    query,
    resultCount: results.length,
    results: results.map((r: any) => ({ title: r.title, url: r.url, score: r.score })),
    contents: contents.map((c: any) => ({
      url: c.url,
      title: c.title,
      text: c.text?.slice(0, 500),
      highlights: c.highlights,
    })),
    duration,
  }, `Searched "${query}" → ${results.length} results, read ${contents.length} pages in ${(duration / 1000).toFixed(1)}s`);
}

registerWorkflow('retrieval.searchAndRead', searchAndReadWorkflow);
