import { registerWorkflow } from './types.js';

registerWorkflow('echo', async (taskId, args, _exa, store) => {
  const delayMs = (args.delayMs as number | undefined) ?? 100;
  await new Promise(resolve => setTimeout(resolve, delayMs));
  store.updateProgress(taskId, { step: 'echoing', completed: 1, total: 1 });
  return { echo: args.message, timestamp: new Date().toISOString() };
});
