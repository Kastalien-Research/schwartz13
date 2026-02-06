import { describe, it, expect } from 'vitest';
import { createTestClient, HAS_API_KEY } from '../setup.js';
import * as searches from '../../../searches.js';
import * as monitors from '../../../monitors.js';

describe.skipIf(!HAS_API_KEY)('Error paths: type/format errors', () => {
  const exa = HAS_API_KEY ? createTestClient() : (null as any);

  it('searches.create with criteria as string → error with common issues', async () => {
    const result = await searches.create({
      websetId: 'nonexistent-ws',
      query: 'profitable companies',
      criteria: 'must be profitable',  // should be [{description: "..."}]
      behavior: 'append',
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('searches.create');
    // The custom error handler includes "Common issues" hints
    expect(result.content[0].text).toContain('Common issues');
  });

  it('searches.create with entity as string → error with common issues', async () => {
    const result = await searches.create({
      websetId: 'nonexistent-ws',
      query: 'tech companies',
      entity: 'company',  // should be {type: "company"}
      behavior: 'append',
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('searches.create');
    expect(result.content[0].text).toContain('Common issues');
  });

  it('monitors.create with single-word cron → validation error', async () => {
    const result = await monitors.create({
      websetId: 'ws-123',
      cron: 'not-a-cron',
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Must have exactly 5 fields');
  });

  it('enrichments error includes Common issues hints', async () => {
    // Import enrichments handler
    const { create } = await import('../../../enrichments.js');

    const result = await create({
      websetId: 'nonexistent-ws',
      description: 'Test',
      format: 'text',
    }, exa);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('enrichments.create');
    expect(result.content[0].text).toContain('Common issues');
  });
});
