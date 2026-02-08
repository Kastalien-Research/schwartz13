import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';

export type WorkflowFunction = (
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
) => Promise<unknown>;

export const workflowRegistry = new Map<string, WorkflowFunction>();

export function registerWorkflow(type: string, fn: WorkflowFunction): void {
  workflowRegistry.set(type, fn);
}
