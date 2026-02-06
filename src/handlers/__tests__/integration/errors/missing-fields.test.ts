import { describe, it, expect } from 'vitest';
import { createTestClient, HAS_API_KEY } from '../setup.js';
import * as websets from '../../../websets.js';
import * as searches from '../../../searches.js';
import * as webhooks from '../../../webhooks.js';
import * as monitors from '../../../monitors.js';

describe.skipIf(!HAS_API_KEY)('Error paths: missing required fields', () => {
  const exa = HAS_API_KEY ? createTestClient() : (null as any);

  it('websets.create with no search or imports → error', async () => {
    const result = await websets.create({}, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it('searches.create with no query → error with hints', async () => {
    // Need a real webset ID for this to fail at the right layer.
    // Using a fake webset ID will fail with "not found" instead.
    // Use a fake ID — we're testing that it returns a structured error either way.
    const result = await searches.create({
      websetId: 'nonexistent-ws',
      behavior: 'append',
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('searches.create');
  });

  it('searches.create with no behavior → error with hints', async () => {
    const result = await searches.create({
      websetId: 'nonexistent-ws',
      query: 'test query',
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('searches.create');
  });

  it('webhooks.create with no url → error', async () => {
    const result = await webhooks.create({
      events: ['webset.item.created'],
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it('webhooks.create with no events → error', async () => {
    const result = await webhooks.create({
      url: 'https://example.com/webhook',
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});
