import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';

// --- Types ---

export interface StepTiming {
  name: string;
  durationMs: number;
}

export interface StepTracker {
  steps: StepTiming[];
  track(name: string, startMs: number): void;
}

// --- Utilities ---

export function createStepTracker(): StepTracker {
  const steps: StepTiming[] = [];
  return {
    steps,
    track(name: string, startMs: number) {
      steps.push({ name, durationMs: Date.now() - startMs });
    },
  };
}

export function isCancelled(taskId: string, store: TaskStore): boolean {
  return store.get(taskId)?.status === 'cancelled';
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function summarizeItem(item: Record<string, unknown>): string {
  const props = item.properties as Record<string, unknown> | undefined;
  if (!props) return 'unknown';
  const company = props.company as Record<string, unknown> | undefined;
  const person = props.person as Record<string, unknown> | undefined;
  const article = props.article as Record<string, unknown> | undefined;
  const name = (
    company?.name ?? person?.name ?? article?.title ?? props.description ?? 'unknown'
  ) as string;
  const url = (props.url ?? '') as string;
  return url ? `${name} (${url})` : name;
}

// --- Polling ---

export async function pollUntilIdle(opts: {
  exa: Exa;
  websetId: string;
  taskId: string;
  store: TaskStore;
  timeoutMs: number;
  stepNum: number;
  totalSteps: number;
}): Promise<{ webset: any; timedOut: boolean }> {
  const { exa, websetId, taskId, store, timeoutMs, stepNum, totalSteps } = opts;
  const deadline = Date.now() + timeoutMs;
  let webset: any;

  while (true) {
    webset = await exa.websets.get(websetId);
    if (webset.status === 'idle') break;
    if (webset.status === 'paused') {
      throw new Error('Webset was paused unexpectedly');
    }

    if (Date.now() >= deadline) {
      return { webset, timedOut: true };
    }

    const searches = webset.searches as any[] | undefined;
    const lastSearch = searches?.[searches.length - 1];
    if (lastSearch?.progress) {
      const prog = lastSearch.progress;
      store.updateProgress(taskId, {
        step: 'searching',
        completed: stepNum,
        total: totalSteps,
        message: `Found ${prog.found}/${prog.analyzed} analyzed`,
      });
    }

    if (isCancelled(taskId, store)) {
      await exa.websets.cancel(websetId);
      return { webset, timedOut: false };
    }

    await sleep(2000);
  }

  return { webset, timedOut: false };
}

// --- Item collection ---

export async function collectItems(
  exa: Exa,
  websetId: string,
  cap = 1000,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  for await (const item of (exa.websets.items as any).listAll(websetId)) {
    items.push(item as Record<string, unknown>);
    if (items.length >= cap) break;
  }
  return items;
}
