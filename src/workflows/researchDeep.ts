import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import { isCancelled, validateRequired, withSummary } from './helpers.js';

async function researchDeepWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();

  validateRequired(args, 'instructions', 'Natural language research question, e.g. "What are the top AI safety labs?"');
  const instructions = args.instructions as string;
  const model = (args.model as string) ?? 'exa-research';
  const outputSchema = args.outputSchema as object | undefined;
  const timeoutMs = (args.timeout as number) ?? 300_000;

  store.updateProgress(taskId, { step: 'creating', completed: 1, total: 3 });

  const params: Record<string, unknown> = { instructions, model };
  if (outputSchema) params.outputSchema = outputSchema;

  const response = await (exa.research as any).create(params);
  const researchId = response.researchId ?? response.id;

  if (isCancelled(taskId, store)) return null;

  store.updateProgress(taskId, { step: 'polling', completed: 2, total: 3 });

  const result = await (exa.research as any).pollUntilFinished(researchId, {
    timeoutMs,
  });

  store.updateProgress(taskId, { step: 'complete', completed: 3, total: 3 });

  const duration = Date.now() - startTime;
  return withSummary({
    researchId,
    status: result.status ?? 'completed',
    result: result.output ?? result.result ?? result,
    model,
    duration,
  }, `Research completed (${model}) in ${(duration / 1000).toFixed(0)}s`);
}

registerWorkflow('research.deep', researchDeepWorkflow);
