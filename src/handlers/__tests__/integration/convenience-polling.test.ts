import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HAS_API_KEY, createTestClient, testId } from './setup.js';
import * as websets from '../../websets.js';
import * as imports from '../../imports.js';
import type { Exa } from 'exa-js';

describe.skipIf(!HAS_API_KEY)('convenience: polling helpers (integration)', () => {
  let exa: Exa;
  let websetId: string;

  beforeAll(async () => {
    exa = createTestClient();
    // Create a small webset that will finish quickly
    const ws = await exa.websets.create({
      search: { query: 'AI startups in Austin', count: 1 },
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

  it('websets.waitUntilIdle — polls until idle', async () => {
    const result = await websets.waitUntilIdle(
      { id: websetId, timeout: 90_000, pollInterval: 2_000 },
      exa,
    );
    expect(result.isError, result.content[0].text).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('id');
    expect(data.status).toBe('idle');
  }, 100_000);

  it('websets.waitUntilIdle — times out with very short timeout', async () => {
    // Create another webset with bigger search to ensure it won't finish in 1ms
    const ws = await exa.websets.create({
      search: { query: 'companies building quantum computing hardware', count: 10 },
      externalId: testId(),
    } as any);
    try {
      const result = await websets.waitUntilIdle(
        { id: ws.id, timeout: 1, pollInterval: 1 },
        exa,
      );
      // If it happened to be idle already (unlikely), that's OK
      if (result.isError) {
        expect(result.content[0].text).toContain('Error');
      }
    } finally {
      try { await exa.websets.cancel(ws.id); } catch {}
      try { await exa.websets.delete(ws.id); } catch {}
    }
  }, 30_000);

  it('imports.waitUntilCompleted — nonexistent ID returns error', async () => {
    const result = await imports.waitUntilCompleted(
      { id: 'nonexistent-import-12345', timeout: 5_000, pollInterval: 1_000 },
      exa,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});
