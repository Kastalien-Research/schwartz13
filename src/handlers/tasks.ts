import type { OperationHandler } from './types.js';
import { successResult, errorResult, requireParams } from './types.js';
import { taskStore } from '../lib/taskStore.js';
import { workflowRegistry } from '../workflows/types.js';
import { WorkflowError } from '../workflows/helpers.js';

export const create: OperationHandler = async (args, exa) => {
  const guard = requireParams('tasks.create', args, 'type');
  if (guard) return guard;

  const type = args.type as string;
  const workflow = workflowRegistry.get(type);
  if (!workflow) {
    const available = [...workflowRegistry.keys()].join(', ') || '(none)';
    return errorResult('tasks.create', `Unknown task type: "${type}". Available: ${available}`);
  }

  try {
    const taskArgs = (args.args as Record<string, unknown>) ?? args;
    const task = taskStore.create(type, taskArgs);

    void workflow(task.id, taskArgs, exa, taskStore)
      .then(result => taskStore.setResult(task.id, result))
      .catch(err => taskStore.setError(task.id, {
        step: err instanceof WorkflowError ? err.step : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        recoverable: err instanceof WorkflowError ? err.recoverable : false,
      }));

    return successResult({ taskId: task.id, status: 'pending' });
  } catch (error) {
    return errorResult('tasks.create', error);
  }
};

export const get: OperationHandler = async (args) => {
  const guard = requireParams('tasks.get', args, 'taskId');
  if (guard) return guard;

  const task = taskStore.get(args.taskId as string);
  if (!task) {
    return errorResult('tasks.get', `Task not found: ${args.taskId}`);
  }
  return successResult(task);
};

export const result: OperationHandler = async (args) => {
  const guard = requireParams('tasks.result', args, 'taskId');
  if (guard) return guard;

  const task = taskStore.get(args.taskId as string);
  if (!task) {
    return errorResult('tasks.result', `Task not found: ${args.taskId}`);
  }

  if (task.status === 'completed') {
    return successResult({ status: 'completed', result: task.result });
  }
  if (task.status === 'failed') {
    return successResult({ status: 'failed', error: task.error });
  }
  if (task.status === 'cancelled') {
    return successResult({ status: 'cancelled' });
  }
  return successResult({
    status: task.status,
    message: 'Task is still running',
    progress: task.progress,
    partialResult: task.partialResult,
  });
};

export const list: OperationHandler = async (args) => {
  const status = args.status as string | undefined;
  const tasks = taskStore.list(status as any);
  return successResult({
    tasks: tasks.map(t => ({
      id: t.id,
      type: t.type,
      status: t.status,
      progress: t.progress,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    count: tasks.length,
  });
};

export const cancel: OperationHandler = async (args) => {
  const guard = requireParams('tasks.cancel', args, 'taskId');
  if (guard) return guard;

  const cancelled = taskStore.cancel(args.taskId as string);
  if (!cancelled) {
    return errorResult('tasks.cancel', `Cannot cancel task ${args.taskId} (not found or already finished)`);
  }
  return successResult({ taskId: args.taskId, status: 'cancelled' });
};
