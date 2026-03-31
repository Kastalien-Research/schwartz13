import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow, type WorkflowMeta } from './types.js';
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

const meta: WorkflowMeta = {
  title: 'Deep Research',
  description: 'Run open-ended research using the Exa Research API. Provide a natural language question and optionally a structured output schema. Good for questions that need synthesis across multiple sources.',
  category: 'research',
  parameters: [
    { name: 'instructions', type: 'string', required: true, description: 'Natural language research question' },
    { name: 'model', type: 'string', required: false, description: 'Research model to use', default: 'exa-research' },
    { name: 'outputSchema', type: 'object', required: false, description: 'JSON schema for structured output' },
    { name: 'timeout', type: 'number', required: false, description: 'Timeout in milliseconds', default: 300000 },
  ],
  steps: [
    'Create research task via Exa Research API',
    'Poll until research is finished',
  ],
  output: 'Research ID, status, synthesized result text (or structured output if schema provided), model used, and duration.',
  example: `await callOperation('tasks.create', {\n  type: 'research.deep',\n  args: {\n    instructions: 'What are the top AI safety research labs and what approaches are they taking?',\n    model: 'exa-research',\n  }\n});`,
  relatedWorkflows: ['research.verifiedCollection', 'adversarial.verify'],
  tags: ['research', 'deep', 'synthesis', 'question', 'open-ended'],
};

registerWorkflow('research.deep', researchDeepWorkflow, meta);
