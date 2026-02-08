import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';

import '../searchAndRead.js';
import { workflowRegistry } from '../types.js';

describe('retrieval.searchAndRead workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('retrieval.searchAndRead')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates query is required', async () => {
    const task = store.create('retrieval.searchAndRead', {});
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'query is required',
    );
    store.dispose();
  });

  it('searches and reads contents', async () => {
    const mockExa = {
      search: vi.fn().mockResolvedValue({
        results: [
          { title: 'Page 1', url: 'https://a.com', score: 0.9 },
          { title: 'Page 2', url: 'https://b.com', score: 0.8 },
        ],
      }),
      getContents: vi.fn().mockResolvedValue({
        results: [
          { url: 'https://a.com', title: 'Page 1', text: 'Content A', highlights: ['highlight A'] },
          { url: 'https://b.com', title: 'Page 2', text: 'Content B', highlights: ['highlight B'] },
        ],
      }),
    } as any;

    const task = store.create('retrieval.searchAndRead', { query: 'test query', numResults: 2 });
    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.query).toBe('test query');
    expect(result.resultCount).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.contents).toHaveLength(2);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result._summary).toContain('test query');

    expect(mockExa.search).toHaveBeenCalledWith('test query', expect.objectContaining({ numResults: 2 }));
    expect(mockExa.getContents).toHaveBeenCalledWith(
      ['https://a.com', 'https://b.com'],
      { text: true, highlights: true },
    );
    store.dispose();
  });

  it('passes optional search filters', async () => {
    const mockExa = {
      search: vi.fn().mockResolvedValue({ results: [] }),
      getContents: vi.fn(),
    } as any;

    const task = store.create('retrieval.searchAndRead', {
      query: 'AI news',
      category: 'news',
      includeDomains: ['example.com'],
    });

    await workflow(task.id, task.args, mockExa, store);

    expect(mockExa.search).toHaveBeenCalledWith('AI news', expect.objectContaining({
      category: 'news',
      includeDomains: ['example.com'],
    }));
    store.dispose();
  });

  it('skips getContents when no results', async () => {
    const mockExa = {
      search: vi.fn().mockResolvedValue({ results: [] }),
      getContents: vi.fn(),
    } as any;

    const task = store.create('retrieval.searchAndRead', { query: 'obscure topic' });
    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.resultCount).toBe(0);
    expect(result.contents).toHaveLength(0);
    expect(mockExa.getContents).not.toHaveBeenCalled();
    store.dispose();
  });

  it('returns null when cancelled', async () => {
    const task = store.create('retrieval.searchAndRead', { query: 'test' });
    const mockExa = {
      search: vi.fn().mockImplementation(async () => {
        store.cancel(task.id);
        return { results: [{ url: 'https://a.com' }] };
      }),
      getContents: vi.fn(),
    } as any;

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    expect(mockExa.getContents).not.toHaveBeenCalled();
    store.dispose();
  });
});
