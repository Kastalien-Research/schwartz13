import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';

import '../verifiedAnswer.js';
import { workflowRegistry } from '../types.js';

describe('retrieval.verifiedAnswer workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('retrieval.verifiedAnswer')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates query is required', async () => {
    const task = store.create('retrieval.verifiedAnswer', {});
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'query is required',
    );
    store.dispose();
  });

  it('answers, validates, and computes overlap', async () => {
    const mockExa = {
      answer: vi.fn().mockResolvedValue({
        answer: 'The answer is 42',
        citations: [
          { url: 'https://source1.com', title: 'Source 1' },
          { url: 'https://source2.com', title: 'Source 2' },
        ],
      }),
      search: vi.fn().mockResolvedValue({
        results: [
          { url: 'https://source1.com', title: 'Source 1' }, // overlaps with citation
          { url: 'https://source3.com', title: 'Source 3' }, // independent
          { url: 'https://source4.com', title: 'Source 4' }, // independent
        ],
      }),
      getContents: vi.fn().mockResolvedValue({
        results: [
          { url: 'https://source1.com', title: 'Source 1', highlights: ['key fact'] },
          { url: 'https://source3.com', title: 'Source 3', highlights: ['other fact'] },
          { url: 'https://source4.com', title: 'Source 4', highlights: ['more'] },
        ],
      }),
    } as any;

    const task = store.create('retrieval.verifiedAnswer', { query: 'What is the answer?' });
    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.answer).toBe('The answer is 42');
    expect(result.citations).toHaveLength(2);
    expect(result.validationSources).toHaveLength(3);
    expect(result.overlapCount).toBe(1); // source1.com appears in both
    expect(result.citationCount).toBe(2);
    expect(result.validationCount).toBe(3);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result._summary).toContain('1/3');
    store.dispose();
  });

  it('passes answer options', async () => {
    const mockExa = {
      answer: vi.fn().mockResolvedValue({ answer: 'ok', citations: [] }),
      search: vi.fn().mockResolvedValue({ results: [] }),
      getContents: vi.fn(),
    } as any;

    const task = store.create('retrieval.verifiedAnswer', {
      query: 'test',
      model: 'gpt-4o',
      systemPrompt: 'Be concise',
    });

    await workflow(task.id, task.args, mockExa, store);

    expect(mockExa.answer).toHaveBeenCalledWith('test', {
      model: 'gpt-4o',
      systemPrompt: 'Be concise',
    });
    store.dispose();
  });

  it('handles zero validation results', async () => {
    const mockExa = {
      answer: vi.fn().mockResolvedValue({
        answer: 'response',
        citations: [{ url: 'https://a.com', title: 'A' }],
      }),
      search: vi.fn().mockResolvedValue({ results: [] }),
      getContents: vi.fn(),
    } as any;

    const task = store.create('retrieval.verifiedAnswer', { query: 'niche question' });
    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.overlapCount).toBe(0);
    expect(result.validationSources).toHaveLength(0);
    expect(mockExa.getContents).not.toHaveBeenCalled();
    store.dispose();
  });

  it('returns null when cancelled', async () => {
    const task = store.create('retrieval.verifiedAnswer', { query: 'test' });
    const mockExa = {
      answer: vi.fn().mockImplementation(async () => {
        store.cancel(task.id);
        return { answer: 'x', citations: [] };
      }),
      search: vi.fn(),
      getContents: vi.fn(),
    } as any;

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    expect(mockExa.search).not.toHaveBeenCalled();
    store.dispose();
  });
});
