import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyItem,
  scoreEnrichment,
  scoreItem,
  selectElites,
  summarizeItem,
  type ClassifiedItem,
} from '../qdWinnow.js';
import { TaskStore } from '../../lib/taskStore.js';

// --- Helper: build mock items ---

function mockEvaluation(criterion: string, satisfied: 'yes' | 'no' | 'unclear') {
  return { criterion, satisfied, reasoning: '', references: [] };
}

function mockEnrichmentResult(
  format: string,
  result: string[] | null,
  status = 'completed',
) {
  return {
    enrichmentId: 'enr_1',
    format,
    result,
    status,
    reasoning: null,
    references: [],
    object: 'enrichment_result',
  };
}

function mockItem(
  evaluations: Array<{ criterion: string; satisfied: string }>,
  enrichments: Array<{ format: string; result: string[] | null; status: string }> | null = null,
  properties: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `item_${Math.random().toString(36).slice(2)}`,
    object: 'webset_item',
    evaluations,
    enrichments,
    properties,
    websetId: 'ws_test',
    sourceId: 'src_test',
    source: 'search',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// --- Tests ---

describe('qd.winnow helpers', () => {
  describe('classifyItem', () => {
    it('classifies item with all criteria satisfied', () => {
      const item = mockItem([
        mockEvaluation('Founded after 2015', 'yes'),
        mockEvaluation('Has research', 'yes'),
      ]);
      const result = classifyItem(item, ['Founded after 2015', 'Has research']);
      expect(result.niche).toBe('1,1');
      expect(result.vector).toEqual([true, true]);
    });

    it('classifies item with mixed satisfaction', () => {
      const item = mockItem([
        mockEvaluation('Founded after 2015', 'yes'),
        mockEvaluation('Has research', 'no'),
      ]);
      const result = classifyItem(item, ['Founded after 2015', 'Has research']);
      expect(result.niche).toBe('1,0');
      expect(result.vector).toEqual([true, false]);
    });

    it('treats "unclear" as false', () => {
      const item = mockItem([
        mockEvaluation('Founded after 2015', 'unclear'),
        mockEvaluation('Has research', 'yes'),
      ]);
      const result = classifyItem(item, ['Founded after 2015', 'Has research']);
      expect(result.niche).toBe('0,1');
      expect(result.vector).toEqual([false, true]);
    });

    it('classifies item with no evaluations into zero niche', () => {
      const item = mockItem([]);
      const result = classifyItem(item, ['A', 'B', 'C']);
      expect(result.niche).toBe('0,0,0');
      expect(result.vector).toEqual([false, false, false]);
    });

    it('handles missing criterion in evaluations', () => {
      const item = mockItem([mockEvaluation('A', 'yes')]);
      const result = classifyItem(item, ['A', 'B']);
      expect(result.niche).toBe('1,0');
    });
  });

  describe('scoreEnrichment', () => {
    it('scores number format by parsing value', () => {
      expect(scoreEnrichment({ format: 'number', result: ['42.5'], status: 'completed' })).toBe(42.5);
    });

    it('scores unparseable number as 0', () => {
      expect(scoreEnrichment({ format: 'number', result: ['N/A'], status: 'completed' })).toBe(0);
    });

    it('scores options format as 1 when present', () => {
      expect(scoreEnrichment({ format: 'options', result: ['Series A'], status: 'completed' })).toBe(1);
    });

    it('scores text format as 1 when non-empty', () => {
      expect(scoreEnrichment({ format: 'text', result: ['some text'], status: 'completed' })).toBe(1);
    });

    it('scores empty text as 0', () => {
      expect(scoreEnrichment({ format: 'text', result: [''], status: 'completed' })).toBe(0);
    });

    it('scores null result as 0', () => {
      expect(scoreEnrichment({ format: 'text', result: null, status: 'completed' })).toBe(0);
    });

    it('scores pending enrichment as 0', () => {
      expect(scoreEnrichment({ format: 'number', result: ['100'], status: 'pending' })).toBe(0);
    });

    it('scores canceled enrichment as 0', () => {
      expect(scoreEnrichment({ format: 'number', result: ['100'], status: 'canceled' })).toBe(0);
    });

    it('scores date/email/phone/url as presence-based', () => {
      expect(scoreEnrichment({ format: 'date', result: ['2024-01-01'], status: 'completed' })).toBe(1);
      expect(scoreEnrichment({ format: 'email', result: ['a@b.com'], status: 'completed' })).toBe(1);
      expect(scoreEnrichment({ format: 'phone', result: ['+1234'], status: 'completed' })).toBe(1);
      expect(scoreEnrichment({ format: 'url', result: ['https://x.com'], status: 'completed' })).toBe(1);
    });
  });

  describe('scoreItem', () => {
    it('averages completed enrichment scores', () => {
      const item = mockItem([], [
        mockEnrichmentResult('number', ['10']),
        mockEnrichmentResult('text', ['hello']),
      ]);
      // (10 + 1) / 2 = 5.5
      expect(scoreItem(item)).toBe(5.5);
    });

    it('returns 0 for item with no enrichments', () => {
      expect(scoreItem(mockItem([], null))).toBe(0);
      expect(scoreItem(mockItem([], []))).toBe(0);
    });

    it('skips pending enrichments', () => {
      const item = mockItem([], [
        mockEnrichmentResult('number', ['10']),
        mockEnrichmentResult('number', ['999'], 'pending'),
      ]);
      expect(scoreItem(item)).toBe(10);
    });
  });

  describe('selectElites — diverse', () => {
    it('picks best per niche', () => {
      const classified: ClassifiedItem[] = [
        { item: { id: 'a' }, niche: '1,0', criteriaVector: [true, false], fitnessScore: 5 },
        { item: { id: 'b' }, niche: '1,0', criteriaVector: [true, false], fitnessScore: 10 },
        { item: { id: 'c' }, niche: '0,1', criteriaVector: [false, true], fitnessScore: 3 },
        { item: { id: 'd' }, niche: '1,1', criteriaVector: [true, true], fitnessScore: 7 },
      ];
      const elites = selectElites(classified, 'diverse');
      expect(elites).toHaveLength(3);
      expect(elites[0].item).toEqual({ id: 'b' }); // niche 1,0 best=10
      expect(elites[1].item).toEqual({ id: 'd' }); // niche 1,1 best=7
      expect(elites[2].item).toEqual({ id: 'c' }); // niche 0,1 best=3
    });

    it('returns empty for empty input', () => {
      expect(selectElites([], 'diverse')).toEqual([]);
    });
  });

  describe('selectElites — all-criteria', () => {
    it('returns only items satisfying all criteria', () => {
      const classified: ClassifiedItem[] = [
        { item: { id: 'a' }, niche: '1,1', criteriaVector: [true, true], fitnessScore: 8 },
        { item: { id: 'b' }, niche: '1,0', criteriaVector: [true, false], fitnessScore: 12 },
        { item: { id: 'c' }, niche: '1,1', criteriaVector: [true, true], fitnessScore: 5 },
      ];
      const elites = selectElites(classified, 'all-criteria');
      expect(elites).toHaveLength(2);
      expect(elites[0].item).toEqual({ id: 'a' }); // fitness 8
      expect(elites[1].item).toEqual({ id: 'c' }); // fitness 5
    });
  });

  describe('selectElites — any-criteria', () => {
    it('excludes zero-niche items', () => {
      const classified: ClassifiedItem[] = [
        { item: { id: 'a' }, niche: '0,0', criteriaVector: [false, false], fitnessScore: 100 },
        { item: { id: 'b' }, niche: '1,0', criteriaVector: [true, false], fitnessScore: 5 },
        { item: { id: 'c' }, niche: '0,1', criteriaVector: [false, true], fitnessScore: 3 },
      ];
      const elites = selectElites(classified, 'any-criteria');
      expect(elites).toHaveLength(2);
      expect(elites.find(e => (e.item as any).id === 'a')).toBeUndefined();
    });
  });

  describe('quality metrics computation', () => {
    it('computes coverage correctly', () => {
      // 2 criteria → 4 possible niches; 3 populated → coverage = 0.75
      const niches = new Set(['1,1', '1,0', '0,1']);
      const possibleNiches = Math.pow(2, 2);
      expect(niches.size / possibleNiches).toBe(0.75);
    });

    it('computes Shannon entropy correctly', () => {
      // Equal distribution across 2 niches of 2 items each
      const dist = { '1,0': 2, '0,1': 2 };
      const total = 4;
      const possibleNiches = 4; // 2 criteria
      const entropy = Object.values(dist).reduce((sum, count) => {
        const p = count / total;
        return sum - (p > 0 ? p * Math.log2(p) : 0);
      }, 0);
      const maxEntropy = Math.log2(possibleNiches);
      const diversity = entropy / maxEntropy;
      expect(entropy).toBe(1); // log2(2) = 1
      expect(diversity).toBe(0.5); // 1 / log2(4) = 1/2
    });

    it('handles single niche (zero entropy)', () => {
      const dist = { '1,1': 5 };
      const total = 5;
      const entropy = Object.values(dist).reduce((sum, count) => {
        const p = count / total;
        return sum - (p > 0 ? p * Math.log2(p) : 0);
      }, 0);
      expect(entropy).toBe(0);
    });
  });

  describe('descriptor feedback', () => {
    it('labels too-strict criteria (< 5%)', () => {
      const criteria = [{ description: 'Very strict', successRate: 2 }];
      const feedback = criteria.map(c => ({
        criterion: c.description,
        successRate: c.successRate,
        quality: c.successRate < 5 ? 'too-strict' : c.successRate > 95 ? 'not-discriminating' : 'good-discriminator',
      }));
      expect(feedback[0].quality).toBe('too-strict');
    });

    it('labels not-discriminating criteria (> 95%)', () => {
      const criteria = [{ description: 'Too easy', successRate: 98 }];
      const feedback = criteria.map(c => ({
        criterion: c.description,
        successRate: c.successRate,
        quality: c.successRate < 5 ? 'too-strict' : c.successRate > 95 ? 'not-discriminating' : 'good-discriminator',
      }));
      expect(feedback[0].quality).toBe('not-discriminating');
    });

    it('labels good-discriminator criteria (5-95%)', () => {
      const criteria = [{ description: 'Good one', successRate: 45 }];
      const feedback = criteria.map(c => ({
        criterion: c.description,
        successRate: c.successRate,
        quality: c.successRate < 5 ? 'too-strict' : c.successRate > 95 ? 'not-discriminating' : 'good-discriminator',
      }));
      expect(feedback[0].quality).toBe('good-discriminator');
    });
  });

  describe('summarizeItem', () => {
    it('extracts company name and url', () => {
      const item = mockItem([], null, {
        type: 'company',
        company: { name: 'Acme Corp' },
        url: 'https://acme.com',
      });
      expect(summarizeItem(item)).toBe('Acme Corp (https://acme.com)');
    });

    it('extracts person name', () => {
      const item = mockItem([], null, {
        type: 'person',
        person: { name: 'Jane Doe' },
        url: 'https://example.com',
      });
      expect(summarizeItem(item)).toBe('Jane Doe (https://example.com)');
    });

    it('falls back to description', () => {
      const item = mockItem([], null, {
        type: 'custom',
        description: 'A thing',
      });
      expect(summarizeItem(item)).toBe('A thing');
    });

    it('returns unknown for empty properties', () => {
      expect(summarizeItem({ id: 'x' })).toBe('unknown');
    });
  });

  describe('full workflow', () => {
    it('produces correct result shape with mocked exa', async () => {
      const store = new TaskStore();

      const items = [
        mockItem(
          [mockEvaluation('C1', 'yes'), mockEvaluation('C2', 'yes')],
          [mockEnrichmentResult('number', ['10'])],
          { type: 'company', company: { name: 'Alpha' }, url: 'https://alpha.com' },
        ),
        mockItem(
          [mockEvaluation('C1', 'yes'), mockEvaluation('C2', 'no')],
          [mockEnrichmentResult('text', ['info'])],
          { type: 'company', company: { name: 'Beta' }, url: 'https://beta.com' },
        ),
        mockItem(
          [mockEvaluation('C1', 'no'), mockEvaluation('C2', 'yes')],
          [mockEnrichmentResult('number', ['5'])],
          { type: 'company', company: { name: 'Gamma' }, url: 'https://gamma.com' },
        ),
      ];

      async function* listAllGen() {
        for (const item of items) yield item;
      }

      const mockExa = {
        websets: {
          create: vi.fn().mockResolvedValue({
            id: 'ws_test',
            status: 'idle',
            searches: [{
              progress: { found: 3, analyzed: 10, completion: 100, timeLeft: null },
              criteria: [
                { description: 'C1', successRate: 30 },
                { description: 'C2', successRate: 60 },
              ],
            }],
          }),
          get: vi.fn().mockResolvedValue({
            id: 'ws_test',
            status: 'idle',
            searches: [{
              progress: { found: 3, analyzed: 10, completion: 100, timeLeft: null },
              criteria: [
                { description: 'C1', successRate: 30 },
                { description: 'C2', successRate: 60 },
              ],
            }],
          }),
          cancel: vi.fn(),
          items: { listAll: vi.fn().mockReturnValue(listAllGen()) },
          searches: { create: vi.fn() },
          enrichments: { create: vi.fn() },
        },
        research: {
          create: vi.fn(),
          pollUntilFinished: vi.fn(),
        },
      } as any;

      // Import the workflow module to trigger registration
      await import('../qdWinnow.js');

      // Use the workflow registry
      const { workflowRegistry } = await import('../types.js');
      const workflow = workflowRegistry.get('qd.winnow');
      expect(workflow).toBeDefined();

      const task = store.create('qd.winnow', {
        query: 'test query',
        entity: { type: 'company' },
        criteria: [{ description: 'C1' }, { description: 'C2' }],
        enrichments: [{ description: 'Count', format: 'number' }],
        count: 10,
      });

      const result = await workflow!(task.id, task.args, mockExa, store) as any;

      expect(result).toBeDefined();
      expect(result.websetId).toBe('ws_test');
      expect(result.itemCount).toBe(3);
      expect(result.nicheDistribution).toEqual({ '1,1': 1, '1,0': 1, '0,1': 1 });
      expect(result.elites).toHaveLength(3); // diverse: 3 niches
      expect(result.qualityMetrics).toBeDefined();
      expect(result.qualityMetrics.coverage).toBe(0.75); // 3 of 4 niches
      expect(result.qualityMetrics.stringency).toBeCloseTo(0.3); // 3/10
      expect(result.descriptorFeedback).toHaveLength(2);
      expect(result.descriptorFeedback[0].quality).toBe('good-discriminator');
      expect(result.steps).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);

      store.dispose();
    });

    it('validates missing criteria', async () => {
      const store = new TaskStore();
      const { workflowRegistry } = await import('../types.js');
      const workflow = workflowRegistry.get('qd.winnow')!;
      const task = store.create('qd.winnow', {
        query: 'test',
        entity: { type: 'company' },
        criteria: [],
        enrichments: [{ description: 'x' }],
      });

      await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
        'criteria is required and must be non-empty',
      );
      store.dispose();
    });

    it('validates missing enrichments', async () => {
      const store = new TaskStore();
      const { workflowRegistry } = await import('../types.js');
      const workflow = workflowRegistry.get('qd.winnow')!;
      const task = store.create('qd.winnow', {
        query: 'test',
        entity: { type: 'company' },
        criteria: [{ description: 'A' }],
        enrichments: [],
      });

      await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
        'enrichments is required and must be non-empty',
      );
      store.dispose();
    });

    it('validates query required without seedWebsetId', async () => {
      const store = new TaskStore();
      const { workflowRegistry } = await import('../types.js');
      const workflow = workflowRegistry.get('qd.winnow')!;
      const task = store.create('qd.winnow', {
        entity: { type: 'company' },
        criteria: [{ description: 'A' }],
        enrichments: [{ description: 'x' }],
      });

      await expect(workflow(task.id, task.args, {} as any, store)).rejects.toThrow(
        'query is required unless seedWebsetId is provided',
      );
      store.dispose();
    });

    it('handles cancellation during polling', async () => {
      const store = new TaskStore();
      const { workflowRegistry } = await import('../types.js');
      const workflow = workflowRegistry.get('qd.winnow')!;

      let pollCount = 0;
      const mockExa = {
        websets: {
          create: vi.fn().mockResolvedValue({
            id: 'ws_cancel',
            status: 'running',
            searches: [],
          }),
          get: vi.fn().mockImplementation(async () => {
            pollCount++;
            if (pollCount === 1) {
              // Cancel the task on first poll
              store.cancel(task.id);
            }
            return { id: 'ws_cancel', status: 'running', searches: [] };
          }),
          cancel: vi.fn(),
          items: { listAll: vi.fn() },
          searches: { create: vi.fn() },
          enrichments: { create: vi.fn() },
        },
      } as any;

      const task = store.create('qd.winnow', {
        query: 'test',
        entity: { type: 'company' },
        criteria: [{ description: 'A' }],
        enrichments: [{ description: 'x' }],
      });

      const result = await workflow(task.id, task.args, mockExa, store);
      expect(result).toBeNull();
      expect(mockExa.websets.cancel).toHaveBeenCalledWith('ws_cancel');
      store.dispose();
    });

    it('handles empty items gracefully', async () => {
      const store = new TaskStore();
      const { workflowRegistry } = await import('../types.js');
      const workflow = workflowRegistry.get('qd.winnow')!;

      async function* emptyGen() {
        // yields nothing
      }

      const mockExa = {
        websets: {
          create: vi.fn().mockResolvedValue({
            id: 'ws_empty',
            status: 'idle',
            searches: [{ progress: { found: 0, analyzed: 5, completion: 100 }, criteria: [] }],
          }),
          get: vi.fn().mockResolvedValue({
            id: 'ws_empty',
            status: 'idle',
            searches: [{ progress: { found: 0, analyzed: 5, completion: 100 }, criteria: [] }],
          }),
          cancel: vi.fn(),
          items: { listAll: vi.fn().mockReturnValue(emptyGen()) },
          searches: { create: vi.fn() },
          enrichments: { create: vi.fn() },
        },
      } as any;

      const task = store.create('qd.winnow', {
        query: 'test',
        entity: { type: 'company' },
        criteria: [{ description: 'A' }],
        enrichments: [{ description: 'x' }],
      });

      const result = await workflow(task.id, task.args, mockExa, store) as any;
      expect(result.itemCount).toBe(0);
      expect(result.elites).toEqual([]);
      expect(result.qualityMetrics.coverage).toBe(0);
      expect(result.qualityMetrics.avgFitness).toBe(0);
      store.dispose();
    });
  });
});
