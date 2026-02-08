import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import {
  createStepTracker,
  isCancelled,
  pollUntilIdle,
  collectItems,
  summarizeItem,
  validateRequired,
  withSummary,
} from './helpers.js';

async function adversarialVerifyWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();
  const tracker = createStepTracker();

  const entity = args.entity as { type: string } | undefined;
  const count = (args.count as number) ?? 25;
  const enrichments = args.enrichments as Array<Record<string, unknown>> | undefined;
  const synthesize = (args.synthesize as boolean) ?? false;
  const timeoutMs = (args.timeout as number) ?? 300_000;

  // Validate
  const step0 = Date.now();
  validateRequired(args, 'thesis', 'The hypothesis to test, e.g. "Remote work improves developer productivity"');
  validateRequired(args, 'thesisQuery', 'Search query for supporting evidence');
  validateRequired(args, 'antithesisQuery', 'Search query for counter-evidence');
  const thesis = args.thesis as string;
  const thesisQuery = args.thesisQuery as string;
  const antithesisQuery = args.antithesisQuery as string;
  tracker.track('validate', step0);

  if (isCancelled(taskId, store)) return null;

  // Create thesis webset
  const step1 = Date.now();
  store.updateProgress(taskId, { step: 'creating thesis webset', completed: 1, total: synthesize ? 7 : 5 });

  const thesisParams: Record<string, unknown> = {
    search: { query: thesisQuery, count, entity },
  };
  if (enrichments) thesisParams.enrichments = enrichments;
  const thesisWebset = await exa.websets.create(thesisParams as any);
  tracker.track('create-thesis', step1);

  if (isCancelled(taskId, store)) {
    await exa.websets.cancel(thesisWebset.id);
    return null;
  }

  // Create antithesis webset
  const step2 = Date.now();
  store.updateProgress(taskId, { step: 'creating antithesis webset', completed: 2, total: synthesize ? 7 : 5 });

  const antithesisParams: Record<string, unknown> = {
    search: { query: antithesisQuery, count, entity },
  };
  if (enrichments) antithesisParams.enrichments = enrichments;
  const antithesisWebset = await exa.websets.create(antithesisParams as any);
  tracker.track('create-antithesis', step2);

  if (isCancelled(taskId, store)) {
    await exa.websets.cancel(thesisWebset.id);
    await exa.websets.cancel(antithesisWebset.id);
    return null;
  }

  // Poll thesis
  const step3 = Date.now();
  store.updateProgress(taskId, { step: 'polling thesis', completed: 3, total: synthesize ? 7 : 5 });
  await pollUntilIdle({
    exa,
    websetId: thesisWebset.id,
    taskId,
    store,
    timeoutMs,
    stepNum: 3,
    totalSteps: synthesize ? 7 : 5,
  });
  tracker.track('poll-thesis', step3);

  if (isCancelled(taskId, store)) return null;

  // Poll antithesis
  const step4 = Date.now();
  store.updateProgress(taskId, { step: 'polling antithesis', completed: 4, total: synthesize ? 7 : 5 });
  await pollUntilIdle({
    exa,
    websetId: antithesisWebset.id,
    taskId,
    store,
    timeoutMs,
    stepNum: 4,
    totalSteps: synthesize ? 7 : 5,
  });
  tracker.track('poll-antithesis', step4);

  if (isCancelled(taskId, store)) return null;

  // Collect items from both
  const step5 = Date.now();
  store.updateProgress(taskId, { step: 'collecting', completed: 5, total: synthesize ? 7 : 5 });
  const thesisItems = await collectItems(exa, thesisWebset.id, count * 2);
  const antithesisItems = await collectItems(exa, antithesisWebset.id, count * 2);
  tracker.track('collect', step5);

  store.setPartialResult(taskId, {
    thesis: { websetId: thesisWebset.id, itemCount: thesisItems.length },
    antithesis: { websetId: antithesisWebset.id, itemCount: antithesisItems.length },
  });

  // Synthesize if requested
  let synthesis: Record<string, unknown> | undefined;
  if (synthesize) {
    const step6 = Date.now();
    store.updateProgress(taskId, { step: 'synthesizing', completed: 6, total: 7 });

    const thesisSummaries = thesisItems.slice(0, 20).map(i => `- ${summarizeItem(i)}`).join('\n');
    const antithesisSummaries = antithesisItems.slice(0, 20).map(i => `- ${summarizeItem(i)}`).join('\n');

    const instructions = `Given supporting evidence for the thesis "${thesis}":
${thesisSummaries}

And counter-evidence:
${antithesisSummaries}

Provide a balanced assessment including: verdict, confidence level, key supporting factors, key countering factors, and identified blind spots.`;

    try {
      const researchResp = await (exa.research as any).create({
        instructions,
        model: 'exa-research-fast',
      });
      const researchId = researchResp.researchId ?? researchResp.id;
      const researchResult = await (exa.research as any).pollUntilFinished(researchId, {
        timeoutMs: 120_000,
      });
      synthesis = {
        researchId,
        content: researchResult.output ?? researchResult.result ?? JSON.stringify(researchResult),
      };
    } catch (err) {
      synthesis = {
        researchId: 'error',
        content: `Synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    tracker.track('synthesize', step6);
  }

  const totalSteps = synthesize ? 7 : 5;
  store.updateProgress(taskId, { step: 'complete', completed: totalSteps, total: totalSteps });

  const duration = Date.now() - startTime;
  const result: Record<string, unknown> = {
    thesis: {
      websetId: thesisWebset.id,
      items: thesisItems,
      itemCount: thesisItems.length,
    },
    antithesis: {
      websetId: antithesisWebset.id,
      items: antithesisItems,
      itemCount: antithesisItems.length,
    },
    duration,
    steps: tracker.steps,
  };
  if (synthesis) result.synthesis = synthesis;

  const synthLabel = synthesis ? ', synthesis completed' : '';
  return withSummary(result, `Thesis: ${thesisItems.length} items, Antithesis: ${antithesisItems.length} items${synthLabel} in ${(duration / 1000).toFixed(0)}s`);
}

registerWorkflow('adversarial.verify', adversarialVerifyWorkflow);
