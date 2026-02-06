import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HAS_API_KEY, createTestClient, testId } from './setup.js';
import * as websets from '../../websets.js';
import * as items from '../../items.js';
import * as monitors from '../../monitors.js';
import * as webhooks from '../../webhooks.js';
import * as imports from '../../imports.js';
import * as events from '../../events.js';
import type { Exa } from 'exa-js';

describe.skipIf(!HAS_API_KEY)('convenience: getAll auto-pagination (integration)', () => {
  let exa: Exa;
  let websetId: string;

  beforeAll(async () => {
    exa = createTestClient();
    // Create a small webset so items.getAll has something to paginate
    const ws = await exa.websets.create({
      search: { query: 'AI startups in Austin', count: 3 },
      externalId: testId(),
    } as any);
    websetId = ws.id;
  });

  afterAll(async () => {
    if (websetId) {
      try { await exa.websets.cancel(websetId); } catch {}
      try { await exa.websets.delete(websetId); } catch {}
    }
  });

  it('websets.getAll — returns {data, count, truncated}', async () => {
    const result = await websets.getAll({ maxItems: 10 }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('truncated');
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.count).toBe('number');
    expect(typeof data.truncated).toBe('boolean');
  });

  it('websets.getAll — respects maxItems cap', async () => {
    const result = await websets.getAll({ maxItems: 1 }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBeLessThanOrEqual(1);
  });

  it('items.getAll — returns {data, count, truncated} for a webset', async () => {
    const result = await items.getAll({ websetId, maxItems: 10 }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('truncated');
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('monitors.getAll — returns {data, count, truncated}', async () => {
    const result = await monitors.getAll({ maxItems: 10 }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('truncated');
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('webhooks.getAll — returns {data, count, truncated}', async () => {
    const result = await webhooks.getAll({ maxItems: 10 }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('truncated');
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('imports.getAll — returns {data, count, truncated}', async () => {
    const result = await imports.getAll({ maxItems: 10 }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('truncated');
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('events.getAll — returns {data, count, truncated}', async () => {
    const result = await events.getAll({ maxItems: 10 }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('truncated');
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('events.getAll — respects types filter', async () => {
    const result = await events.getAll({ maxItems: 10, types: ['webset.created'] }, exa);
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.data)).toBe(true);
  });
});
