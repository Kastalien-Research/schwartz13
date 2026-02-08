import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';

import '../lifecycle.js';
import { workflowRegistry } from '../types.js';

function mockIdleWebset(id: string) {
  return {
    id,
    status: 'idle',
    searches: [{ progress: { found: 5, analyzed: 20 } }],
  };
}

function mockItems(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `item_${i}`,
    properties: { company: { name: `Co ${i}` }, url: `https://co${i}.com` },
  }));
}

function createMockExa(websetId: string, items: any[]) {
  async function* listAllGen() {
    for (const item of items) yield item;
  }

  return {
    websets: {
      create: vi.fn().mockResolvedValue(mockIdleWebset(websetId)),
      get: vi.fn().mockResolvedValue(mockIdleWebset(websetId)),
      cancel: vi.fn(),
      delete: vi.fn(),
      items: { listAll: vi.fn().mockReturnValue(listAllGen()) },
    },
  } as any;
}

describe('lifecycle.harvest workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('lifecycle.harvest')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates query is required', async () => {
    const task = store.create('lifecycle.harvest', { entity: { type: 'company' } });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'query is required',
    );
    store.dispose();
  });

  it('validates entity is required', async () => {
    const task = store.create('lifecycle.harvest', { query: 'test' });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'entity is required',
    );
    store.dispose();
  });

  it('creates webset, polls, and collects items', async () => {
    const items = mockItems(3);
    const mockExa = createMockExa('ws_life', items);

    const task = store.create('lifecycle.harvest', {
      query: 'AI startups',
      entity: { type: 'company' },
      count: 25,
      enrichments: [{ description: 'Revenue', format: 'number' }],
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.websetId).toBe('ws_life');
    expect(result.itemCount).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.enrichmentCount).toBe(1);
    expect(result.searchProgress).toEqual({ found: 5, analyzed: 20 });
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.steps).toBeDefined();
    expect(result.timedOut).toBeUndefined();

    expect(mockExa.websets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ query: 'AI startups' }),
        enrichments: [{ description: 'Revenue', format: 'number' }],
      }),
    );
    store.dispose();
  });

  it('deletes webset when cleanup is true', async () => {
    const mockExa = createMockExa('ws_cleanup', mockItems(1));

    const task = store.create('lifecycle.harvest', {
      query: 'test',
      entity: { type: 'company' },
      cleanup: true,
    });

    await workflow(task.id, task.args, mockExa, store);

    expect(mockExa.websets.delete).toHaveBeenCalledWith('ws_cleanup');
    store.dispose();
  });

  it('does not delete webset by default', async () => {
    const mockExa = createMockExa('ws_keep', mockItems(1));

    const task = store.create('lifecycle.harvest', {
      query: 'test',
      entity: { type: 'company' },
    });

    await workflow(task.id, task.args, mockExa, store);

    expect(mockExa.websets.delete).not.toHaveBeenCalled();
    store.dispose();
  });

  it('returns null when cancelled during creation', async () => {
    const mockExa = {
      websets: {
        create: vi.fn().mockImplementation(async () => {
          store.cancel(task.id);
          return { id: 'ws_cancel', status: 'idle' };
        }),
        cancel: vi.fn(),
        get: vi.fn(),
        items: { listAll: vi.fn() },
      },
    } as any;

    const task = store.create('lifecycle.harvest', {
      query: 'test',
      entity: { type: 'company' },
    });

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    store.dispose();
  });
});
