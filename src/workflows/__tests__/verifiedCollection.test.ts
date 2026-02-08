import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../lib/taskStore.js';
import { expandTemplate } from '../verifiedCollection.js';

import '../verifiedCollection.js';
import { workflowRegistry } from '../types.js';

describe('expandTemplate', () => {
  it('replaces {{name}}, {{url}}, {{description}}', () => {
    const item = {
      properties: {
        company: { name: 'Acme Corp' },
        url: 'https://acme.com',
        description: 'A great company',
      },
    };
    const result = expandTemplate(
      'Tell me about {{name}} at {{url}}. Description: {{description}}',
      item,
    );
    expect(result).toBe('Tell me about Acme Corp at https://acme.com. Description: A great company');
  });

  it('handles missing properties gracefully', () => {
    const result = expandTemplate('Name: {{name}}, URL: {{url}}', {});
    expect(result).toBe('Name: unknown, URL: ');
  });

  it('replaces multiple occurrences', () => {
    const item = { properties: { company: { name: 'X' } } };
    const result = expandTemplate('{{name}} and {{name}} again', item);
    expect(result).toBe('X and X again');
  });
});

describe('research.verifiedCollection workflow', () => {
  let store: TaskStore;
  const workflow = workflowRegistry.get('research.verifiedCollection')!;

  beforeEach(() => {
    store = new TaskStore();
  });

  it('is registered', () => {
    expect(workflow).toBeDefined();
  });

  it('validates query is required', async () => {
    const task = store.create('research.verifiedCollection', {
      entity: { type: 'company' },
      researchPrompt: 'test',
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'query is required',
    );
    store.dispose();
  });

  it('validates entity is required', async () => {
    const task = store.create('research.verifiedCollection', {
      query: 'test',
      researchPrompt: 'test',
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'entity must be an object',
    );
    store.dispose();
  });

  it('validates researchPrompt is required', async () => {
    const task = store.create('research.verifiedCollection', {
      query: 'test',
      entity: { type: 'company' },
    });
    await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
      'researchPrompt is required',
    );
    store.dispose();
  });

  it('creates webset, collects items, and runs per-entity research', async () => {
    const items = [
      { id: '1', properties: { company: { name: 'Acme' }, url: 'https://acme.com', description: 'Tech co' } },
      { id: '2', properties: { company: { name: 'Beta' }, url: 'https://beta.com', description: 'AI co' } },
    ];

    async function* listAllGen() {
      for (const item of items) yield item;
    }

    let researchCallCount = 0;

    const mockExa = {
      websets: {
        create: vi.fn().mockResolvedValue({ id: 'ws_vc', status: 'idle', searches: [] }),
        get: vi.fn().mockResolvedValue({ id: 'ws_vc', status: 'idle', searches: [] }),
        cancel: vi.fn(),
        items: { listAll: vi.fn().mockReturnValue(listAllGen()) },
      },
      research: {
        create: vi.fn().mockImplementation(async () => {
          researchCallCount++;
          return { id: `res_${researchCallCount}` };
        }),
        pollUntilFinished: vi.fn().mockResolvedValue({
          output: 'Research findings',
        }),
      },
    } as any;

    const task = store.create('research.verifiedCollection', {
      query: 'AI companies',
      entity: { type: 'company' },
      researchPrompt: 'Tell me about {{name}} at {{url}}',
      researchLimit: 10,
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.websetId).toBe('ws_vc');
    expect(result.totalItems).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.researchedCount).toBe(2);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    // Verify research was called for each item
    expect(mockExa.research.create).toHaveBeenCalledTimes(2);

    // Verify template expansion
    const firstCall = mockExa.research.create.mock.calls[0][0];
    expect(firstCall.instructions).toContain('Acme');
    expect(firstCall.instructions).toContain('https://acme.com');
    store.dispose();
  });

  it('respects researchLimit', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      properties: { company: { name: `Co ${i}` }, url: `https://co${i}.com` },
    }));

    async function* listAllGen() {
      for (const item of items) yield item;
    }

    const mockExa = {
      websets: {
        create: vi.fn().mockResolvedValue({ id: 'ws_lim', status: 'idle', searches: [] }),
        get: vi.fn().mockResolvedValue({ id: 'ws_lim', status: 'idle', searches: [] }),
        cancel: vi.fn(),
        items: { listAll: vi.fn().mockReturnValue(listAllGen()) },
      },
      research: {
        create: vi.fn().mockResolvedValue({ id: 'res_x' }),
        pollUntilFinished: vi.fn().mockResolvedValue({ output: 'ok' }),
      },
    } as any;

    const task = store.create('research.verifiedCollection', {
      query: 'test',
      entity: { type: 'company' },
      researchPrompt: 'About {{name}}',
      researchLimit: 3,
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    // Only 3 items should have been researched
    expect(mockExa.research.create).toHaveBeenCalledTimes(3);
    expect(result.items).toHaveLength(3);
    expect(result.totalItems).toBe(20);
    store.dispose();
  });

  it('handles per-entity research failure gracefully', async () => {
    const items = [
      { id: '1', properties: { company: { name: 'Acme' }, url: 'https://acme.com' } },
    ];

    async function* listAllGen() {
      for (const item of items) yield item;
    }

    const mockExa = {
      websets: {
        create: vi.fn().mockResolvedValue({ id: 'ws_fail', status: 'idle', searches: [] }),
        get: vi.fn().mockResolvedValue({ id: 'ws_fail', status: 'idle', searches: [] }),
        cancel: vi.fn(),
        items: { listAll: vi.fn().mockReturnValue(listAllGen()) },
      },
      research: {
        create: vi.fn().mockRejectedValue(new Error('Research API down')),
        pollUntilFinished: vi.fn(),
      },
    } as any;

    const task = store.create('research.verifiedCollection', {
      query: 'test',
      entity: { type: 'company' },
      researchPrompt: 'About {{name}}',
    });

    const result = (await workflow(task.id, task.args, mockExa, store)) as any;

    expect(result.items[0].research.researchId).toBe('error');
    expect(result.items[0].research.result).toContain('Research failed');
    expect(result.researchedCount).toBe(0);
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

    const task = store.create('research.verifiedCollection', {
      query: 'test',
      entity: { type: 'company' },
      researchPrompt: 'About {{name}}',
    });

    const result = await workflow(task.id, task.args, mockExa, store);
    expect(result).toBeNull();
    store.dispose();
  });
});
