import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createStepTracker,
  isCancelled,
  sleep,
  summarizeItem,
  pollUntilIdle,
  collectItems,
  validateRequired,
  validateEntity,
  validateQueries,
  withSummary,
  WorkflowError,
} from '../helpers.js';
import { TaskStore } from '../../lib/taskStore.js';

describe('workflow helpers', () => {
  describe('createStepTracker', () => {
    it('tracks step timings', () => {
      const tracker = createStepTracker();
      const start = Date.now();
      tracker.track('test-step', start - 100);
      expect(tracker.steps).toHaveLength(1);
      expect(tracker.steps[0].name).toBe('test-step');
      expect(tracker.steps[0].durationMs).toBeGreaterThanOrEqual(100);
    });

    it('accumulates multiple steps', () => {
      const tracker = createStepTracker();
      tracker.track('a', Date.now());
      tracker.track('b', Date.now());
      expect(tracker.steps).toHaveLength(2);
    });
  });

  describe('isCancelled', () => {
    it('returns true for cancelled task', () => {
      const store = new TaskStore();
      const task = store.create('test', {});
      store.cancel(task.id);
      expect(isCancelled(task.id, store)).toBe(true);
      store.dispose();
    });

    it('returns false for working task', () => {
      const store = new TaskStore();
      const task = store.create('test', {});
      store.updateProgress(task.id, { step: 'x', completed: 0, total: 1 });
      expect(isCancelled(task.id, store)).toBe(false);
      store.dispose();
    });

    it('returns false for nonexistent task', () => {
      const store = new TaskStore();
      expect(isCancelled('nonexistent', store)).toBe(false);
      store.dispose();
    });
  });

  describe('sleep', () => {
    it('resolves after delay', async () => {
      const start = Date.now();
      await sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });

  describe('summarizeItem', () => {
    it('extracts company name and url', () => {
      const item = {
        properties: { company: { name: 'Acme' }, url: 'https://acme.com' },
      };
      expect(summarizeItem(item)).toBe('Acme (https://acme.com)');
    });

    it('extracts person name', () => {
      const item = {
        properties: { person: { name: 'Jane' }, url: 'https://j.com' },
      };
      expect(summarizeItem(item)).toBe('Jane (https://j.com)');
    });

    it('extracts article title', () => {
      const item = {
        properties: { article: { title: 'My Article' } },
      };
      expect(summarizeItem(item)).toBe('My Article');
    });

    it('falls back to description', () => {
      const item = { properties: { description: 'A thing' } };
      expect(summarizeItem(item)).toBe('A thing');
    });

    it('returns unknown for no properties', () => {
      expect(summarizeItem({})).toBe('unknown');
    });
  });

  describe('pollUntilIdle', () => {
    it('returns immediately when webset is idle', async () => {
      const store = new TaskStore();
      const task = store.create('test', {});
      const mockExa = {
        websets: {
          get: vi.fn().mockResolvedValue({ id: 'ws1', status: 'idle', searches: [] }),
          cancel: vi.fn(),
        },
      } as any;

      const result = await pollUntilIdle({
        exa: mockExa,
        websetId: 'ws1',
        taskId: task.id,
        store,
        timeoutMs: 5000,
        stepNum: 1,
        totalSteps: 3,
      });

      expect(result.timedOut).toBe(false);
      expect(result.webset.status).toBe('idle');
      store.dispose();
    });

    it('returns timedOut when deadline exceeded', async () => {
      const store = new TaskStore();
      const task = store.create('test', {});
      const mockExa = {
        websets: {
          get: vi.fn().mockResolvedValue({ id: 'ws1', status: 'running', searches: [] }),
          cancel: vi.fn(),
        },
      } as any;

      const result = await pollUntilIdle({
        exa: mockExa,
        websetId: 'ws1',
        taskId: task.id,
        store,
        timeoutMs: 0, // immediate timeout
        stepNum: 1,
        totalSteps: 3,
      });

      expect(result.timedOut).toBe(true);
      store.dispose();
    });

    it('throws on paused webset', async () => {
      const store = new TaskStore();
      const task = store.create('test', {});
      const mockExa = {
        websets: {
          get: vi.fn().mockResolvedValue({ id: 'ws1', status: 'paused', searches: [] }),
          cancel: vi.fn(),
        },
      } as any;

      await expect(
        pollUntilIdle({
          exa: mockExa,
          websetId: 'ws1',
          taskId: task.id,
          store,
          timeoutMs: 5000,
          stepNum: 1,
          totalSteps: 3,
        }),
      ).rejects.toThrow('paused unexpectedly');
      store.dispose();
    });
  });

  describe('collectItems', () => {
    it('collects items from async generator', async () => {
      async function* gen() {
        yield { id: '1' };
        yield { id: '2' };
        yield { id: '3' };
      }

      const mockExa = {
        websets: { items: { listAll: vi.fn().mockReturnValue(gen()) } },
      } as any;

      const items = await collectItems(mockExa, 'ws1');
      expect(items).toHaveLength(3);
    });

    it('respects cap', async () => {
      async function* gen() {
        for (let i = 0; i < 100; i++) yield { id: String(i) };
      }

      const mockExa = {
        websets: { items: { listAll: vi.fn().mockReturnValue(gen()) } },
      } as any;

      const items = await collectItems(mockExa, 'ws1', 5);
      expect(items).toHaveLength(5);
    });
  });

  describe('validateRequired', () => {
    it('passes when field is present', () => {
      expect(() => validateRequired({ name: 'test' }, 'name')).not.toThrow();
    });

    it('throws when field is missing', () => {
      expect(() => validateRequired({}, 'name')).toThrow('name is required');
    });

    it('throws when field is null', () => {
      expect(() => validateRequired({ name: null }, 'name')).toThrow('name is required');
    });

    it('includes hint in error message', () => {
      expect(() => validateRequired({}, 'query', 'e.g. "AI startups"')).toThrow(
        'query is required. e.g. "AI startups"',
      );
    });

    it('throws WorkflowError with step=validate', () => {
      try {
        validateRequired({}, 'x');
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowError);
        expect((err as WorkflowError).step).toBe('validate');
      }
    });
  });

  describe('validateEntity', () => {
    it('returns valid entity object', () => {
      const result = validateEntity({ type: 'company' });
      expect(result).toEqual({ type: 'company' });
    });

    it('throws for string entity', () => {
      expect(() => validateEntity('company')).toThrow('entity must be an object');
    });

    it('throws for null', () => {
      expect(() => validateEntity(null)).toThrow('entity must be an object');
    });

    it('throws for object missing type', () => {
      expect(() => validateEntity({ name: 'test' })).toThrow('entity must be an object');
    });
  });

  describe('validateQueries', () => {
    it('returns valid queries array', () => {
      const result = validateQueries(['q1', 'q2']);
      expect(result).toEqual(['q1', 'q2']);
    });

    it('throws for non-array', () => {
      expect(() => validateQueries('query')).toThrow('must be an array');
    });

    it('throws for null', () => {
      expect(() => validateQueries(null)).toThrow('must be an array');
    });

    it('throws for too few entries', () => {
      expect(() => validateQueries(['q1'])).toThrow('must have 2-5 entries (got 1)');
    });

    it('throws for too many entries', () => {
      expect(() => validateQueries(['a', 'b', 'c', 'd', 'e', 'f'])).toThrow('must have 2-5 entries (got 6)');
    });
  });

  describe('withSummary', () => {
    it('adds _summary field', () => {
      const result = withSummary({ count: 5 }, 'Found 5 items');
      expect(result._summary).toBe('Found 5 items');
      expect(result.count).toBe(5);
    });

    it('preserves existing fields', () => {
      const result = withSummary({ a: 1, b: 'hello' }, 'summary');
      expect(result.a).toBe(1);
      expect(result.b).toBe('hello');
      expect(result._summary).toBe('summary');
    });
  });

  describe('WorkflowError', () => {
    it('carries step and recoverable fields', () => {
      const err = new WorkflowError('bad input', 'validate', false);
      expect(err.message).toBe('bad input');
      expect(err.step).toBe('validate');
      expect(err.recoverable).toBe(false);
      expect(err).toBeInstanceOf(Error);
    });

    it('defaults recoverable to false', () => {
      const err = new WorkflowError('timeout', 'polling');
      expect(err.recoverable).toBe(false);
    });

    it('supports recoverable=true', () => {
      const err = new WorkflowError('rate limit', 'polling', true);
      expect(err.recoverable).toBe(true);
    });
  });
});
