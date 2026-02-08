import { describe, it, expect, afterAll } from 'vitest';
import { HAS_API_KEY, createTestClient } from '../../../handlers/__tests__/integration/setup.js';
import { TaskStore } from '../../../lib/taskStore.js';

// Trigger workflow registration
import '../../qdWinnow.js';
import { workflowRegistry } from '../../types.js';

describe.skipIf(!HAS_API_KEY)('qd.winnow integration', () => {
  const store = new TaskStore();
  let websetId: string | undefined;

  afterAll(async () => {
    if (websetId) {
      try {
        const exa = createTestClient();
        await exa.websets.cancel(websetId);
      } catch {
        // best-effort cleanup
      }
    }
    store.dispose();
  });

  it(
    'runs full workflow with real API',
    async () => {
      const exa = createTestClient();
      const workflow = workflowRegistry.get('qd.winnow')!;
      expect(workflow).toBeDefined();

      const task = store.create('qd.winnow', {
        query: 'AI safety research organizations',
        entity: { type: 'company' },
        criteria: [
          { description: 'Founded after 2015' },
          { description: 'Has published peer-reviewed research' },
        ],
        enrichments: [
          { description: 'Number of employees', format: 'number' },
        ],
        count: 10,
      });

      const result = (await workflow(task.id, task.args, exa, store)) as any;

      // Capture for cleanup
      websetId = result?.websetId;

      expect(result).toBeDefined();
      expect(result.websetId).toBeTruthy();
      expect(typeof result.itemCount).toBe('number');
      expect(result.nicheDistribution).toBeDefined();
      expect(Array.isArray(result.elites)).toBe(true);
      expect(result.qualityMetrics).toBeDefined();
      expect(typeof result.qualityMetrics.coverage).toBe('number');
      expect(typeof result.qualityMetrics.avgFitness).toBe('number');
      expect(typeof result.qualityMetrics.diversity).toBe('number');
      expect(typeof result.qualityMetrics.stringency).toBe('number');
      expect(Array.isArray(result.descriptorFeedback)).toBe(true);
      expect(Array.isArray(result.steps)).toBe(true);
      expect(typeof result.duration).toBe('number');
    },
    { timeout: 600_000 },
  );
});
