import { describe, it, expect } from 'vitest';
import { createTestClient, HAS_API_KEY } from '../setup.js';
import * as websets from '../../../websets.js';
import * as searches from '../../../searches.js';
import * as items from '../../../items.js';
import * as enrichments from '../../../enrichments.js';
import * as monitors from '../../../monitors.js';
import * as webhooks from '../../../webhooks.js';
import * as events from '../../../events.js';
import * as imports from '../../../imports.js';

const FAKE_ID = 'nonexistent-id-12345';
const FAKE_WEBSET_ID = 'nonexistent-webset-99999';

describe.skipIf(!HAS_API_KEY)('Error paths: invalid resource IDs', () => {
  const exa = HAS_API_KEY ? createTestClient() : (null as any);

  // Helper: assert structured error with meaningful message
  function assertError(result: any, substring?: string) {
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text.length).toBeGreaterThan(0);
    if (substring) {
      expect(result.content[0].text.toLowerCase()).toContain(substring.toLowerCase());
    }
  }

  // --- Websets domain ---
  it('websets.get — nonexistent ID returns error', async () => {
    const result = await websets.get({ id: FAKE_ID }, exa);
    assertError(result);
  });

  it('websets.update — nonexistent ID returns error', async () => {
    const result = await websets.update({ id: FAKE_ID, metadata: { x: 'y' } }, exa);
    assertError(result);
  });

  it('websets.delete — nonexistent ID returns error', async () => {
    const result = await websets.del({ id: FAKE_ID }, exa);
    assertError(result);
  });

  it('websets.cancel — nonexistent ID returns error', async () => {
    const result = await websets.cancel({ id: FAKE_ID }, exa);
    assertError(result);
  });

  // --- Searches domain ---
  it('searches.get — nonexistent IDs return error', async () => {
    const result = await searches.get({ websetId: FAKE_WEBSET_ID, searchId: FAKE_ID }, exa);
    assertError(result);
  });

  it('searches.cancel — nonexistent IDs return error', async () => {
    const result = await searches.cancel({ websetId: FAKE_WEBSET_ID, searchId: FAKE_ID }, exa);
    assertError(result);
  });

  // --- Items domain ---
  it('items.get — nonexistent IDs return error', async () => {
    const result = await items.get({ websetId: FAKE_WEBSET_ID, itemId: FAKE_ID }, exa);
    assertError(result);
  });

  it('items.delete — nonexistent IDs return error', async () => {
    const result = await items.del({ websetId: FAKE_WEBSET_ID, itemId: FAKE_ID }, exa);
    assertError(result);
  });

  // --- Enrichments domain ---
  it('enrichments.get — nonexistent IDs return error', async () => {
    const result = await enrichments.get({ websetId: FAKE_WEBSET_ID, enrichmentId: FAKE_ID }, exa);
    assertError(result);
  });

  it('enrichments.update — nonexistent IDs return error', async () => {
    const result = await enrichments.update({ websetId: FAKE_WEBSET_ID, enrichmentId: FAKE_ID, description: 'x' }, exa);
    assertError(result);
  });

  it('enrichments.cancel — nonexistent IDs return error', async () => {
    const result = await enrichments.cancel({ websetId: FAKE_WEBSET_ID, enrichmentId: FAKE_ID }, exa);
    assertError(result);
  });

  it('enrichments.delete — nonexistent IDs return error', async () => {
    const result = await enrichments.del({ websetId: FAKE_WEBSET_ID, enrichmentId: FAKE_ID }, exa);
    assertError(result);
  });

  // --- Monitors domain ---
  it('monitors.get — nonexistent ID returns error', async () => {
    const result = await monitors.get({ id: FAKE_ID }, exa);
    assertError(result);
  });

  it('monitors.update — nonexistent ID returns error', async () => {
    const result = await monitors.update({ id: FAKE_ID, metadata: { x: 'y' } }, exa);
    assertError(result);
  });

  it('monitors.delete — nonexistent ID returns error', async () => {
    const result = await monitors.del({ id: FAKE_ID }, exa);
    assertError(result);
  });

  it('monitors.runs.list — nonexistent monitor ID returns empty list (not error)', async () => {
    // List operations on nonexistent parents return empty results per REST convention
    const result = await monitors.runsList({ monitorId: FAKE_ID }, exa);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('data');
    expect(data.data).toHaveLength(0);
  });

  it('monitors.runs.get — nonexistent IDs return error', async () => {
    const result = await monitors.runsGet({ monitorId: FAKE_ID, runId: FAKE_ID }, exa);
    assertError(result);
  });

  // --- Webhooks domain ---
  it('webhooks.get — nonexistent ID returns error', async () => {
    const result = await webhooks.get({ id: FAKE_ID }, exa);
    assertError(result);
  });

  it('webhooks.update — nonexistent ID returns error', async () => {
    const result = await webhooks.update({ id: FAKE_ID, url: 'https://example.com' }, exa);
    assertError(result);
  });

  it('webhooks.delete — nonexistent ID returns error', async () => {
    const result = await webhooks.del({ id: FAKE_ID }, exa);
    assertError(result);
  });

  it('webhooks.listAttempts — nonexistent ID returns error', async () => {
    const result = await webhooks.listAttempts({ id: FAKE_ID }, exa);
    assertError(result);
  });

  // --- Events domain ---
  it('events.get — nonexistent ID returns error', async () => {
    const result = await events.get({ id: FAKE_ID }, exa);
    assertError(result);
  });

  // --- Imports domain ---
  it('imports.get — nonexistent ID returns error', async () => {
    const result = await imports.get({ id: FAKE_ID }, exa);
    assertError(result);
  });

  it('imports.update — nonexistent ID returns error', async () => {
    const result = await imports.update({ id: FAKE_ID, title: 'x' }, exa);
    assertError(result);
  });

  it('imports.delete — nonexistent ID returns error', async () => {
    const result = await imports.del({ id: FAKE_ID }, exa);
    assertError(result);
  });
});
