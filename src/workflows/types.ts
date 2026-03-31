import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';

export type WorkflowFunction = (
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
) => Promise<unknown>;

export interface ParameterMeta {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
  constraints?: string;
}

export interface WorkflowMeta {
  title: string;
  description: string;
  category: string;
  parameters: ParameterMeta[];
  steps: string[];
  output: string;
  example: string;
  relatedWorkflows?: string[];
  tags: string[];
}

export const workflowRegistry = new Map<string, WorkflowFunction>();
export const workflowMetadata = new Map<string, WorkflowMeta>();

export function registerWorkflow(type: string, fn: WorkflowFunction, meta?: WorkflowMeta): void {
  workflowRegistry.set(type, fn);
  if (meta) workflowMetadata.set(type, meta);
}
