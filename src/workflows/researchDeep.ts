import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import { isCancelled } from './helpers.js';

async function researchDeepWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();

  const instructions = args.instructions as string | undefined;
  const model = (args.model as string) ?? 'exa-research';
  const outputSchema = args.outputSchema as object | undefined;
  const timeoutMs = (args.timeout as number) ?? 300_000;

  if (!instructions) {
    throw new Error('instructions is required');
  }

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

  return {
    researchId,
    status: result.status ?? 'completed',
    result: result.output ?? result.result ?? result,
    model,
    duration: Date.now() - startTime,
  };
}

registerWorkflow('research.deep', researchDeepWorkflow);
