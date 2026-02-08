import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';
import { diceCoefficient, deduplicateItems } from '../convergent.js';

import '../convergent.js';
import { workflowRegistry } from '../types.js';

// --- Deduplication helper tests ---

describe('diceCoefficient', () => {
  it('returns 1 for identical strings', () => {
    expect(diceCoefficient('hello', 'hello')).toBe(1);
  });

  it('returns 1 for case-insensitive match', () => {
    expect(diceCoefficient('Hello', 'hello')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(diceCoefficient('abc', 'xyz')).toBe(0);
  });

  it('returns high score for similar names', () => {
    expect(diceCoefficient('Acme Corporation', 'Acme Corp')).toBeGreaterThan(0.7);
  });

  it('returns low score for dissimilar names', () => {
    expect(diceCoefficient('Apple Inc', 'Microsoft Corp')).toBeLessThan(0.3);
  });

  it('returns 0 for single-char strings', () => {
    expect(diceCoefficient('a', 'a')).toBe(1); // exact match
    expect(diceCoefficient('a', 'b')).toBe(0); // too short for bigrams
  });
});

describe('deduplicateItems', () => {
  it('deduplicates by URL match', () => {
    const items1 = [
      { id: '1', properties: { url: 'https://acme.com', company: { name: 'Acme' } } },
      { id: '2', properties: { url: 'https://beta.com', company: { name: 'Beta' } } },
    ];
    const items2 = [
      { id: '3', properties: { url: 'https://acme.com', company: { name: 'Acme Inc' } } },
      { id: '4', properties: { url: 'https://gamma.com', company: { name: 'Gamma' } } },
    ];

    const result = deduplicateItems([items1, items2]);

    expect(result.intersection).toHaveLength(1);
    expect(result.intersection[0].url).toBe('https://acme.com');
    expect(result.unique).toHaveLength(2); // Beta and Gamma
  });

  it('deduplicates by fuzzy name match', () => {
    const items1 = [
      { id: '1', properties: { url: 'https://a.com', company: { name: 'Acme Corporation' } } },
    ];
    const items2 = [
      { id: '2', properties: { url: 'https://b.com', company: { name: 'Acme Corporation' } } },
    ];

    const result = deduplicateItems([items1, items2]);

    expect(result.intersection).toHaveLength(1);
    expect(result.unique).toHaveLength(0);
  });

  it('keeps dissimilar items as unique', () => {
    const items1 = [
      { id: '1', properties: { url: 'https://a.com', company: { name: 'Alpha' } } },
    ];
    const items2 = [
      { id: '2', properties: { url: 'https://b.com', company: { name: 'Zeta' } } },
    ];

    const result = deduplicateItems([items1, items2]);

    expect(result.intersection).toHaveLength(0);
    expect(result.unique).toHaveLength(2);
  });

  it('handles 3+ query sources', () => {
    const shared = { properties: { url: 'https://shared.com', company: { name: 'Shared' } } };
    const items1 = [shared, { id: '1', properties: { url: 'https://a.com', company: { name: 'A' } } }];
    const items2 = [{ id: '2', properties: { url: 'https://shared.com', company: { name: 'Shared' } } }];
    const items3 = [{ id: '3', properties: { url: 'https://shared.com', company: { name: 'Shared' } } }];

    const result = deduplicateItems([items1, items2, items3]);

    expect(result.intersection).toHaveLength(1);
    expect(result.intersection[0].queryIndices).toEqual([0, 1, 2]);
    expect(result.unique).toHaveLength(1);
  });
});

// --- Workflow tests ---

describe('convergent.search workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('convergent.search')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates queries is required', async () => {
    const task = store.create('convergent.search', { entity: { type: 'company' } });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'queries is required',
    );
    store.dispose();
  });

  it('validates queries must have 2-5 entries', async () => {
    const task = store.create('convergent.search', {
      queries: ['only one'],
      entity: { type: 'company' },
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'queries must have 2-5 entries',
    );
    store.dispose();
  });

  it('validates entity is required', async () => {
    const task = store.create('convergent.search', {
      queries: ['q1', 'q2'],
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'entity is required',
    );
    store.dispose();
  });

  it('creates websets, polls, collects, and deduplicates', async () => {
    let createCount = 0;
    let listAllCount = 0;

    const items1 = [
      { id: '1', properties: { url: 'https://shared.com', company: { name: 'Shared' } } },
      { id: '2', properties: { url: 'https://a.com', company: { name: 'Alpha' } } },
    ];
    const items2 = [
      { id: '3', properties: { url: 'https://shared.com', company: { name: 'Shared' } } },
      { id: '4', properties: { url: 'https://b.com', company: { name: 'Beta' } } },
    ];

    const mockExa = {
      websets: {
        create: vi.fn().mockImplementation(async () => {
          createCount++;
          return { id: `ws_${createCount}`, status: 'idle', searches: [] };
        }),
        get: vi.fn().mockImplementation(async (id: string) => ({
          id,
          status: 'idle',
          searches: [],
        })),
        cancel: vi.fn(),
        items: {
          listAll: vi.fn().mockImplementation(function () {
            listAllCount++;
            const items = listAllCount === 1 ? items1 : items2;
            return (async function* () {
              for (const item of items) yield item;
            })();
          }),
        },
      },
    } as any;

    const task = store.create('convergent.search', {
      queries: ['AI startups', 'machine learning companies'],
      entity: { type: 'company' },
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.websetIds).toEqual(['ws_1', 'ws_2']);
    expect(result.intersection).toHaveLength(1);
    expect(result.intersection[0].url).toBe('https://shared.com');
    expect(result.intersection[0].confidence).toBe(1); // 2/2
    expect(result.unique).toHaveLength(2);
    expect(result.overlapMatrix[0][1]).toBe(1);
    expect(result.overlapMatrix[1][0]).toBe(1);
    expect(result.totalUniqueEntities).toBe(3);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    expect(mockExa.websets.create).toHaveBeenCalledTimes(2);
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

    const task = store.create('convergent.search', {
      queries: ['q1', 'q2'],
      entity: { type: 'company' },
    });

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    store.dispose();
  });
});
