import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';

import '../expandAndCollect.js';
import { workflowRegistry } from '../types.js';

describe('retrieval.expandAndCollect workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('retrieval.expandAndCollect')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates query is required', async () => {
    const task = store.create('retrieval.expandAndCollect', {});
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'query is required',
    );
    store.dispose();
  });

  it('searches, expands, and deduplicates', async () => {
    const mockExa = {
      search: vi.fn().mockResolvedValue({
        results: [
          { title: 'A', url: 'https://a.com', score: 0.9 },
          { title: 'B', url: 'https://b.com', score: 0.8 },
          { title: 'C', url: 'https://c.com', score: 0.7 },
        ],
      }),
      findSimilar: vi.fn()
        .mockResolvedValueOnce({
          results: [
            { title: 'D', url: 'https://d.com', score: 0.85 },
            { title: 'A dup', url: 'https://a.com', score: 0.8 }, // duplicate
          ],
        })
        .mockResolvedValueOnce({
          results: [
            { title: 'E', url: 'https://e.com', score: 0.75 },
          ],
        }),
    } as any;

    const task = store.create('retrieval.expandAndCollect', {
      query: 'test', numResults: 3, expandTop: 2,
    });
    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.initialCount).toBe(3);
    expect(result.expandedCount).toBe(3); // 2 + 1
    expect(result.deduplicatedCount).toBe(5); // A, B, C, D, E (A dup removed)
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result._summary).toContain('5 unique');

    expect(mockExa.search).toHaveBeenCalledOnce();
    expect(mockExa.findSimilar).toHaveBeenCalledTimes(2);
    store.dispose();
  });

  it('handles expandTop larger than results', async () => {
    const mockExa = {
      search: vi.fn().mockResolvedValue({
        results: [{ title: 'A', url: 'https://a.com' }],
      }),
      findSimilar: vi.fn().mockResolvedValue({ results: [] }),
    } as any;

    const task = store.create('retrieval.expandAndCollect', {
      query: 'test', expandTop: 5,
    });
    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.initialCount).toBe(1);
    expect(mockExa.findSimilar).toHaveBeenCalledTimes(1); // only 1 result to expand
    store.dispose();
  });

  it('returns null when cancelled', async () => {
    const task = store.create('retrieval.expandAndCollect', { query: 'test' });
    const mockExa = {
      search: vi.fn().mockImplementation(async () => {
        store.cancel(task.id);
        return { results: [{ url: 'https://a.com' }] };
      }),
      findSimilar: vi.fn(),
    } as any;

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    expect(mockExa.findSimilar).not.toHaveBeenCalled();
    store.dispose();
  });
});
