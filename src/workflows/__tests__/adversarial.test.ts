import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';

import '../adversarial.js';
import { workflowRegistry } from '../types.js';

function mockIdleWebset(id: string) {
  return { id, status: 'idle', searches: [] };
}

function mockItems(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}_${i}`,
    properties: { company: { name: `${prefix} Co ${i}` }, url: `https://${prefix}${i}.com` },
  }));
}

function createMockExa(thesisItems: any[], antithesisItems: any[]) {
  let createCount = 0;
  let listAllCount = 0;

  return {
    websets: {
      create: vi.fn().mockImplementation(async () => {
        createCount++;
        return mockIdleWebset(`ws_${createCount}`);
      }),
      get: vi.fn().mockImplementation(async (id: string) => mockIdleWebset(id)),
      cancel: vi.fn(),
      items: {
        listAll: vi.fn().mockImplementation(function () {
          listAllCount++;
          const items = listAllCount === 1 ? thesisItems : antithesisItems;
          return (async function* () {
            for (const item of items) yield item;
          })();
        }),
      },
    },
    research: {
      create: vi.fn().mockResolvedValue({ id: 'res_synth' }),
      pollUntilFinished: vi.fn().mockResolvedValue({
        output: 'Balanced synthesis result',
      }),
    },
  } as any;
}

describe('adversarial.verify workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('adversarial.verify')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates thesis is required', async () => {
    const task = store.create('adversarial.verify', {
      thesisQuery: 'q1',
      antithesisQuery: 'q2',
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'thesis is required',
    );
    store.dispose();
  });

  it('validates thesisQuery is required', async () => {
    const task = store.create('adversarial.verify', {
      thesis: 'claim',
      antithesisQuery: 'q2',
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'thesisQuery is required',
    );
    store.dispose();
  });

  it('validates antithesisQuery is required', async () => {
    const task = store.create('adversarial.verify', {
      thesis: 'claim',
      thesisQuery: 'q1',
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'antithesisQuery is required',
    );
    store.dispose();
  });

  it('creates thesis and antithesis websets and collects items', async () => {
    const thesisItems = mockItems('thesis', 3);
    const antithesisItems = mockItems('anti', 2);
    const mockExa = createMockExa(thesisItems, antithesisItems);

    const task = store.create('adversarial.verify', {
      thesis: 'AI improves productivity',
      thesisQuery: 'AI productivity gains',
      antithesisQuery: 'AI productivity hype',
      entity: { type: 'company' },
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.thesis.websetId).toBe('ws_1');
    expect(result.thesis.itemCount).toBe(3);
    expect(result.antithesis.websetId).toBe('ws_2');
    expect(result.antithesis.itemCount).toBe(2);
    expect(result.synthesis).toBeUndefined();
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.steps).toBeDefined();

    expect(mockExa.websets.create).toHaveBeenCalledTimes(2);
    store.dispose();
  });

  it('synthesizes when synthesize=true', async () => {
    const mockExa = createMockExa(mockItems('t', 2), mockItems('a', 2));

    const task = store.create('adversarial.verify', {
      thesis: 'Remote work is better',
      thesisQuery: 'remote work benefits',
      antithesisQuery: 'remote work problems',
      synthesize: true,
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.synthesis).toBeDefined();
    expect(result.synthesis.researchId).toBe('res_synth');
    expect(result.synthesis.content).toBe('Balanced synthesis result');

    expect(mockExa.research.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'exa-research-fast' }),
    );
    store.dispose();
  });

  it('handles synthesis failure gracefully', async () => {
    const mockExa = createMockExa(mockItems('t', 1), mockItems('a', 1));
    mockExa.research.create.mockRejectedValue(new Error('API rate limit'));

    const task = store.create('adversarial.verify', {
      thesis: 'claim',
      thesisQuery: 'q1',
      antithesisQuery: 'q2',
      synthesize: true,
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.synthesis.researchId).toBe('error');
    expect(result.synthesis.content).toContain('Synthesis failed');
    expect(result.synthesis.content).toContain('API rate limit');
    store.dispose();
  });

  it('returns null when cancelled', async () => {
    const mockExa = {
      websets: {
        create: vi.fn().mockImplementation(async () => {
          store.cancel(task.id);
          return { id: 'ws_c', status: 'idle' };
        }),
        cancel: vi.fn(),
        get: vi.fn(),
        items: { listAll: vi.fn() },
      },
    } as any;

    const task = store.create('adversarial.verify', {
      thesis: 'claim',
      thesisQuery: 'q1',
      antithesisQuery: 'q2',
    });

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    store.dispose();
  });
});
