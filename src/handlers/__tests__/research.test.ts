import { describe, it, expect, vi } from 'vitest';
import type { Exa } from 'exa-js';
import { create, get, list, pollUntilFinished } from '../research.js';

function mockExa(overrides: Record<string, any> = {}): Exa {
  return {
    research: {
      create: vi.fn().mockResolvedValue({
        researchId: 'res_123',
        status: 'pending',
        instructions: 'test',
        model: 'exa-research',
        createdAt: Date.now(),
      }),
      get: vi.fn().mockResolvedValue({
        researchId: 'res_123',
        status: 'running',
        instructions: 'test',
        model: 'exa-research',
        createdAt: Date.now(),
      }),
      list: vi.fn().mockResolvedValue({
        data: [],
        hasMore: false,
        nextCursor: null,
      }),
      pollUntilFinished: vi.fn().mockResolvedValue({
        researchId: 'res_123',
        status: 'completed',
        instructions: 'test',
        model: 'exa-research',
        createdAt: Date.now(),
        finishedAt: Date.now(),
        output: { content: 'result text' },
        costDollars: { total: 0.05, numSearches: 2, numPages: 5, reasoningTokens: 100 },
      }),
      ...overrides,
    },
  } as unknown as Exa;
}

describe('research handlers', () => {
  describe('create', () => {
    it('requires instructions', async () => {
      const res = await create({}, mockExa());
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('instructions');
    });

    it('creates a research request', async () => {
      const exa = mockExa();
      const res = await create({ instructions: 'Find AI startups' }, exa);
      expect(res.isError).toBeUndefined();
      const data = JSON.parse(res.content[0].text);
      expect(data.researchId).toBe('res_123');
      expect(exa.research.create).toHaveBeenCalledWith({ instructions: 'Find AI startups' });
    });

    it('passes model and outputSchema', async () => {
      const exa = mockExa();
      const schema = { type: 'object', properties: { name: { type: 'string' } } };
      await create({ instructions: 'test', model: 'exa-research-pro', outputSchema: schema }, exa);
      expect(exa.research.create).toHaveBeenCalledWith({
        instructions: 'test',
        model: 'exa-research-pro',
        outputSchema: schema,
      });
    });

    it('handles API errors', async () => {
      const exa = mockExa({ create: vi.fn().mockRejectedValue(new Error('API limit')) });
      const res = await create({ instructions: 'test' }, exa);
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('API limit');
    });
  });

  describe('get', () => {
    it('requires researchId', async () => {
      const res = await get({}, mockExa());
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('researchId');
    });

    it('retrieves research by id', async () => {
      const exa = mockExa();
      const res = await get({ researchId: 'res_123' }, exa);
      expect(res.isError).toBeUndefined();
      expect(exa.research.get).toHaveBeenCalledWith('res_123', undefined);
    });

    it('passes events option', async () => {
      const exa = mockExa();
      await get({ researchId: 'res_123', events: true }, exa);
      expect(exa.research.get).toHaveBeenCalledWith('res_123', { events: true });
    });
  });

  describe('list', () => {
    it('lists with no args', async () => {
      const exa = mockExa();
      const res = await list({}, exa);
      expect(res.isError).toBeUndefined();
      expect(exa.research.list).toHaveBeenCalledWith(undefined);
    });

    it('passes cursor and limit', async () => {
      const exa = mockExa();
      await list({ cursor: 'abc', limit: 5 }, exa);
      expect(exa.research.list).toHaveBeenCalledWith({ cursor: 'abc', limit: 5 });
    });
  });

  describe('pollUntilFinished', () => {
    it('requires researchId', async () => {
      const res = await pollUntilFinished({}, mockExa());
      expect(res.isError).toBe(true);
    });

    it('polls until finished', async () => {
      const exa = mockExa();
      const res = await pollUntilFinished({ researchId: 'res_123' }, exa);
      expect(res.isError).toBeUndefined();
      const data = JSON.parse(res.content[0].text);
      expect(data.status).toBe('completed');
      expect(data.output.content).toBe('result text');
    });

    it('passes poll options', async () => {
      const exa = mockExa();
      await pollUntilFinished({ researchId: 'res_123', pollInterval: 500, timeoutMs: 10000, events: true }, exa);
      expect(exa.research.pollUntilFinished).toHaveBeenCalledWith('res_123', {
        pollInterval: 500,
        timeoutMs: 10000,
        events: true,
      });
    });
  });
});
