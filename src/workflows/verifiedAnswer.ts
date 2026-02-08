import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import { isCancelled, validateRequired, withSummary } from './helpers.js';

async function verifiedAnswerWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();

  // Validate & extract args
  validateRequired(args, 'query', 'Question to answer and verify');
  const query = args.query as string;
  const numValidation = (args.numValidation as number) ?? 3;

  // Build answer options
  const answerOpts: Record<string, unknown> = {};
  if (args.model) answerOpts.model = args.model;
  if (args.systemPrompt) answerOpts.systemPrompt = args.systemPrompt;

  // Step 1: Get answer with citations
  store.updateProgress(taskId, { step: 'answering', completed: 1, total: 4 });
  const answerResponse = await exa.answer(query, Object.keys(answerOpts).length > 0 ? answerOpts as any : undefined);
  const answer = (answerResponse as any).answer ?? (answerResponse as any).result ?? '';
  const citations = (answerResponse as any).citations ?? (answerResponse as any).results ?? [];
  const citationUrls = citations.map((c: any) => c.url).filter(Boolean) as string[];

  if (isCancelled(taskId, store)) return null;

  // Step 2: Independent search for validation
  store.updateProgress(taskId, { step: 'validating', completed: 2, total: 4, message: 'Independent search for corroboration' });
  const searchResponse = await exa.search(query, { numResults: numValidation } as any);
  const validationResults = (searchResponse as any).results ?? [];
  const validationUrls = validationResults.map((r: any) => r.url).filter(Boolean) as string[];

  if (isCancelled(taskId, store)) return null;

  // Step 3: Read validation sources
  store.updateProgress(taskId, { step: 'reading validation sources', completed: 3, total: 4 });
  let validationContents: any[] = [];
  if (validationUrls.length > 0) {
    const contentsResponse = await exa.getContents(validationUrls, { text: true, highlights: true } as any);
    validationContents = (contentsResponse as any).results ?? [];
  }

  if (isCancelled(taskId, store)) return null;

  // Step 4: Compute overlap
  store.updateProgress(taskId, { step: 'complete', completed: 4, total: 4 });

  const citationUrlSet = new Set(citationUrls);
  const overlapCount = validationUrls.filter(url => citationUrlSet.has(url)).length;

  const duration = Date.now() - startTime;
  return withSummary({
    query,
    answer,
    citations: citations.map((c: any) => ({ url: c.url, title: c.title })),
    validationSources: validationContents.map((c: any) => ({
      url: c.url,
      title: c.title,
      highlights: c.highlights,
    })),
    overlapCount,
    citationCount: citationUrls.length,
    validationCount: validationUrls.length,
    duration,
  }, `Answer verified: ${overlapCount}/${validationUrls.length} validation sources overlap with citations in ${(duration / 1000).toFixed(1)}s`);
}

registerWorkflow('retrieval.verifiedAnswer', verifiedAnswerWorkflow);
