import { describe, it, expect } from 'vitest';
import { Exa } from 'exa-js';
import * as enrichments from '../../../enrichments.js';
import * as monitors from '../../../monitors.js';

// Application-level validation tests — these fail BEFORE hitting the API,
// so they don't need a real API key.
const dummyExa = new Exa('dummy-key-not-used');

describe('Error paths: application-level validation', () => {
  // --- Enrichments validation ---
  describe('enrichments.create validation', () => {
    it('format=options with no options array → requires options', async () => {
      const result = await enrichments.create({
        websetId: 'ws-123',
        description: 'Test enrichment',
        format: 'options',
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('you must provide the options parameter');
    });

    it('format=options with empty options array → requires options', async () => {
      const result = await enrichments.create({
        websetId: 'ws-123',
        description: 'Test enrichment',
        format: 'options',
        options: [],
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('you must provide the options parameter');
    });

    it('151 options → too many options', async () => {
      const options = Array.from({ length: 151 }, (_, i) => ({ label: `Option ${i}` }));
      const result = await enrichments.create({
        websetId: 'ws-123',
        description: 'Test enrichment',
        format: 'options',
        options,
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Too many options: 151');
      expect(result.content[0].text).toContain('Maximum is 150');
    });

    it('exactly 150 options → passes validation (hits API)', async () => {
      const options = Array.from({ length: 150 }, (_, i) => ({ label: `Option ${i}` }));
      const result = await enrichments.create({
        websetId: 'ws-123',
        description: 'Test enrichment',
        format: 'options',
        options,
      }, dummyExa);

      // Should pass local validation and fail at the API level (bad key/ID)
      // Either way it shouldn't contain our validation message
      expect(result.content[0].text).not.toContain('Too many options');
    });
  });

  // --- Monitors validation ---
  describe('monitors.create validation', () => {
    it('cron with 3 fields → must have exactly 5 fields', async () => {
      const result = await monitors.create({
        websetId: 'ws-123',
        cron: '* * *',
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Must have exactly 5 fields');
    });

    it('cron with 6 fields → must have exactly 5 fields', async () => {
      const result = await monitors.create({
        websetId: 'ws-123',
        cron: '0 9 * * 1 2026',
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Must have exactly 5 fields');
    });

    it('cron with 1 field → must have exactly 5 fields', async () => {
      const result = await monitors.create({
        websetId: 'ws-123',
        cron: 'daily',
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Must have exactly 5 fields');
    });

    it('count=0 → must be at least 1', async () => {
      const result = await monitors.create({
        websetId: 'ws-123',
        cron: '0 9 * * 1',
        count: 0,
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Must be at least 1');
    });

    it('count=-5 → must be at least 1', async () => {
      const result = await monitors.create({
        websetId: 'ws-123',
        cron: '0 9 * * 1',
        count: -5,
      }, dummyExa);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Must be at least 1');
    });

    it('valid cron (5 fields) + valid count → passes validation', async () => {
      const result = await monitors.create({
        websetId: 'ws-123',
        cron: '0 9 * * 1',
        count: 10,
      }, dummyExa);

      // Passes validation, fails at API (bad key)
      expect(result.content[0].text).not.toContain('Must have exactly 5 fields');
      expect(result.content[0].text).not.toContain('Must be at least 1');
    });
  });
});
