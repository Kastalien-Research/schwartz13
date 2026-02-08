import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';

// Import to trigger registration
import '../researchDeep.js';
import { workflowRegistry } from '../types.js';

describe('research.deep workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('research.deep')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates instructions is required', async () => {
    const task = store.create('research.deep', {});
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'instructions is required',
    );
    store.dispose();
  });

  it('creates research and polls until finished', async () => {
    const mockExa = {
      research: {
        create: vi.fn().mockResolvedValue({ id: 'res_1' }),
        pollUntilFinished: vi.fn().mockResolvedValue({
          status: 'completed',
          output: 'Research findings here',
        }),
      },
    } as any;

    const task = store.create('research.deep', {
      instructions: 'Find trends in AI safety',
      model: 'exa-research-pro',
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.researchId).toBe('res_1');
    expect(result.status).toBe('completed');
    expect(result.result).toBe('Research findings here');
    expect(result.model).toBe('exa-research-pro');
    expect(result.duration).toBeGreaterThanOrEqual(0);

    expect(mockExa.research.create).toHaveBeenCalledWith({
      instructions: 'Find trends in AI safety',
      model: 'exa-research-pro',
    });
    store.dispose();
  });

  it('uses default model exa-research', async () => {
    const mockExa = {
      research: {
        create: vi.fn().mockResolvedValue({ id: 'res_2' }),
        pollUntilFinished: vi.fn().mockResolvedValue({ output: 'result' }),
      },
    } as any;

    const task = store.create('research.deep', {
      instructions: 'Test query',
    });

    await workflow(task.id, task.args, mockExa, store);

    expect(mockExa.research.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'exa-research' }),
    );
    store.dispose();
  });

  it('passes outputSchema when provided', async () => {
    const schema = { type: 'object', properties: { summary: { type: 'string' } } };
    const mockExa = {
      research: {
        create: vi.fn().mockResolvedValue({ id: 'res_3' }),
        pollUntilFinished: vi.fn().mockResolvedValue({ result: { summary: 'test' } }),
      },
    } as any;

    const task = store.create('research.deep', {
      instructions: 'Test',
      outputSchema: schema,
    });

    await workflow(task.id, task.args, mockExa, store);

    expect(mockExa.research.create).toHaveBeenCalledWith(
      expect.objectContaining({ outputSchema: schema }),
    );
    store.dispose();
  });

  it('returns null when cancelled', async () => {
    const mockExa = {
      research: {
        create: vi.fn().mockImplementation(async () => {
          store.cancel(task.id);
          return { id: 'res_4' };
        }),
        pollUntilFinished: vi.fn(),
      },
    } as any;

    const task = store.create('research.deep', {
      instructions: 'Test',
    });

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    store.dispose();
  });
});
