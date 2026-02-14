import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';
import { registerWorkflow } from './types.js';
import {
  createStepTracker,
  isCancelled,
  pollUntilIdle,
  collectItems,
  withSummary,
  WorkflowError,
} from './helpers.js';
import { projectItem } from '../lib/projections.js';
import { diceCoefficient } from './convergent.js';

// --- Constants ---

const MS_PER_DAY = 86_400_000;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_NAME_THRESHOLD = 0.85;
const MAX_LENSES = 10;
const MAX_CONDITIONS_PER_SHAPE = 20;
const MAX_REGEX_LENGTH = 200;

// --- Types ---

interface SemanticCronConfig {
  lenses: LensConfig[];
  shapes: ShapeConfig[];
  join: JoinConfig;
  signal: SignalConfig;
  monitor?: { cron: string; timezone?: string };
}

interface LensConfig {
  id: string;
  source: {
    query?: string;
    websetId?: string;
    entity?: { type: string };
    criteria?: Array<{ description: string }>;
    enrichments?: Array<{
      description: string;
      format?: string;
      options?: Array<{ label: string }>;
    }>;
    count?: number;
  };
}

interface ShapeConfig {
  lensId: string;
  conditions: Condition[];
  logic: 'all' | 'any';
}

export type ConditionOperator =
  | 'gte' | 'gt' | 'lte' | 'lt' | 'eq'
  | 'contains' | 'matches' | 'oneOf'
  | 'exists' | 'withinDays';

interface Condition {
  enrichment: string;
  operator: ConditionOperator;
  value?: number | string | string[];
}

interface JoinConfig {
  by: 'entity' | 'temporal' | 'entity+temporal' | 'cooccurrence';
  entityMatch?: { nameThreshold?: number };
  temporal?: { days?: number };
  minLensOverlap?: number;
}

interface SignalConfig {
  requires: {
    type: 'all' | 'any' | 'threshold' | 'combination';
    min?: number;
    sufficient?: string[][];
  };
}

// Internal result types

interface LensResult {
  lensId: string;
  websetId: string;
  totalItems: number;
  shapedItems: ShapedItem[];
}

interface ShapedItem {
  id: string;
  name: string;
  url: string;
  enrichments: Record<string, unknown>; // description → result value
  createdAt: string;
}

interface JoinedEntity {
  entity: string;
  url: string;
  presentInLenses: string[];
  lensCount: number;
  shapes: Record<string, Record<string, unknown>>; // lensId → enrichment values
}

export interface JoinResult {
  type: string;
  entities: JoinedEntity[];
  lensesWithEvidence: string[];
}

export interface SignalResult {
  fired: boolean;
  satisfiedBy: string[];
  rule: string;
  matchedCombination?: string[];
  entities: string[];
}

export interface SnapshotData {
  evaluatedAt: string;
  lenses: Record<
    string,
    {
      websetId: string;
      totalItems: number;
      shapedCount: number;
      shapes: Array<{ name: string; url: string; enrichments: Record<string, unknown> }>;
    }
  >;
  join: JoinResult;
  signal: SignalResult;
}

interface Delta {
  newShapedItems: Record<string, number>;
  newJoins: string[];
  lostJoins: string[];
  signalTransition: {
    was: boolean;
    now: boolean;
    changed: boolean;
    newEntities: string[];
    lostEntities: string[];
  };
  timeSinceLastEval: string;
}

// --- 1. Template Expander ---

export function expandTemplates(
  config: SemanticCronConfig,
  variables: Record<string, string>,
): SemanticCronConfig {
  const json = JSON.stringify(config);
  let expanded = json;
  for (const [key, value] of Object.entries(variables)) {
    // Escape value for JSON string context to prevent injection
    const escaped = JSON.stringify(value).slice(1, -1);
    expanded = expanded.replaceAll(`{{${key}}}`, escaped);
  }

  // Check for unresolved templates
  const unresolved = expanded.match(/\{\{[^}]+\}\}/g);
  if (unresolved) {
    throw new WorkflowError(
      `Unresolved template variables: ${[...new Set(unresolved)].join(', ')}`,
      'validate',
    );
  }

  return JSON.parse(expanded) as SemanticCronConfig;
}

// --- 2. Enrichment Resolver + Shape Evaluator ---

export interface ResolvedEnrichment {
  description: string;
  result: string[] | null;
}

export function resolveEnrichmentDescriptions(
  items: Record<string, unknown>[],
  enrichmentMap: Map<string, string>, // enrichmentId → description
): Array<{ item: Record<string, unknown>; enrichments: ResolvedEnrichment[] }> {
  return items.map(item => {
    const rawEnrichments = item.enrichments as
      | Array<{
          enrichmentId: string;
          format: string;
          result: string[] | null;
          status: string;
        }>
      | undefined
      | null;

    if (!rawEnrichments) {
      return { item, enrichments: [] };
    }

    const resolved: ResolvedEnrichment[] = [];
    for (const e of rawEnrichments) {
      const description = enrichmentMap.get(e.enrichmentId);
      if (description) {
        resolved.push({ description, result: e.result });
      }
    }
    return { item, enrichments: resolved };
  });
}

export function evaluateCondition(
  condition: Condition,
  enrichmentResult: string[] | null,
): boolean {
  if (condition.operator === 'exists') {
    return (
      enrichmentResult !== null &&
      enrichmentResult !== undefined &&
      enrichmentResult.length > 0 &&
      enrichmentResult[0].length > 0
    );
  }

  if (
    enrichmentResult === null ||
    enrichmentResult === undefined ||
    enrichmentResult.length === 0
  ) {
    return false;
  }

  const raw = enrichmentResult[0];

  switch (condition.operator) {
    case 'gte':
    case 'gt':
    case 'lte':
    case 'lt':
    case 'eq': {
      const num = Number(raw);
      if (isNaN(num)) return false;
      if (typeof condition.value !== 'number') return false;
      const target = condition.value;
      switch (condition.operator) {
        case 'gte': return num >= target;
        case 'gt':  return num > target;
        case 'lte': return num <= target;
        case 'lt':  return num < target;
        case 'eq':  return num === target;
      }
    }
    // falls through only if inner switch is exhaustive (it is) — unreachable
    case 'contains':
      if (typeof condition.value !== 'string') return false;
      return raw.toLowerCase().includes(condition.value.toLowerCase());
    case 'matches': {
      if (typeof condition.value !== 'string') return false;
      if (condition.value.length > MAX_REGEX_LENGTH) return false;
      try {
        return new RegExp(condition.value).test(raw);
      } catch {
        return false; // Invalid regex pattern
      }
    }
    case 'oneOf': {
      if (!Array.isArray(condition.value)) return false;
      return condition.value.some(opt => opt.toLowerCase() === raw.toLowerCase());
    }
    case 'withinDays': {
      if (typeof condition.value !== 'number') return false;
      const parsed = new Date(raw).getTime();
      if (isNaN(parsed)) return false;
      return Math.abs(Date.now() - parsed) <= condition.value * MS_PER_DAY;
    }
    default:
      return false;
  }
}

export function evaluateShape(
  shape: ShapeConfig,
  enrichments: ResolvedEnrichment[],
): boolean {
  const results = shape.conditions.map(cond => {
    const match = enrichments.find(e => e.description === cond.enrichment);
    return evaluateCondition(cond, match?.result ?? null);
  });

  return shape.logic === 'all' ? results.every(Boolean) : results.some(Boolean);
}

// --- 3. Join Engine ---

export function joinLensResults(
  lensResults: LensResult[],
  joinConfig: JoinConfig,
): JoinResult {
  const threshold = joinConfig.entityMatch?.nameThreshold ?? DEFAULT_NAME_THRESHOLD;
  const minOverlap = joinConfig.minLensOverlap ?? 2;
  const temporalDays = joinConfig.temporal?.days;

  if (joinConfig.by === 'cooccurrence') {
    return joinByCooccurrence(lensResults, temporalDays);
  }

  if (joinConfig.by === 'temporal') {
    return joinByTemporal(lensResults, temporalDays ?? 7);
  }

  // Entity or entity+temporal
  const urlIndex = new Map<string, string>(); // url → entityMap key
  const entityMap = new Map<
    string,
    {
      entity: string;
      url: string;
      lenses: Set<string>;
      shapes: Record<string, Record<string, unknown>>;
      timestamps: Array<{ lensId: string; createdAt: string }>;
    }
  >();

  for (const lr of lensResults) {
    for (const si of lr.shapedItems) {
      // Fast path: URL exact match via index
      if (si.url && urlIndex.has(si.url)) {
        const existing = entityMap.get(urlIndex.get(si.url)!)!;
        existing.lenses.add(lr.lensId);
        existing.shapes[lr.lensId] = si.enrichments;
        existing.timestamps.push({ lensId: lr.lensId, createdAt: si.createdAt });
        continue;
      }

      // Slow path: fuzzy name match
      let matched = false;
      for (const [, existing] of entityMap) {
        if (si.name && existing.entity && diceCoefficient(si.name, existing.entity) > threshold) {
          existing.lenses.add(lr.lensId);
          existing.shapes[lr.lensId] = si.enrichments;
          existing.timestamps.push({ lensId: lr.lensId, createdAt: si.createdAt });
          matched = true;
          break;
        }
      }

      if (!matched) {
        const key = si.url || si.name || si.id;
        entityMap.set(key, {
          entity: si.name,
          url: si.url,
          lenses: new Set([lr.lensId]),
          shapes: { [lr.lensId]: si.enrichments },
          timestamps: [{ lensId: lr.lensId, createdAt: si.createdAt }],
        });
        if (si.url) urlIndex.set(si.url, key);
      }
    }
  }

  let entities: JoinedEntity[] = [...entityMap.values()].map(e => ({
    entity: e.entity,
    url: e.url,
    presentInLenses: [...e.lenses],
    lensCount: e.lenses.size,
    shapes: e.shapes,
  }));

  // entity+temporal: filter by temporal window using timestamps from entityMap directly
  if (joinConfig.by === 'entity+temporal' && temporalDays) {
    const windowMs = temporalDays * MS_PER_DAY;
    // Build lookup from (entity+url) → timestamps
    const timestampLookup = new Map<string, Array<{ lensId: string; createdAt: string }>>();
    for (const entry of entityMap.values()) {
      timestampLookup.set(`${entry.url}||${entry.entity}`, entry.timestamps);
    }

    entities = entities.filter(ent => {
      const ts = timestampLookup.get(`${ent.url}||${ent.entity}`);
      if (!ts) return false;

      // Check if any two items from different lenses are within window
      for (let i = 0; i < ts.length; i++) {
        for (let j = i + 1; j < ts.length; j++) {
          if (ts[i].lensId !== ts[j].lensId) {
            const diff = Math.abs(
              new Date(ts[i].createdAt).getTime() - new Date(ts[j].createdAt).getTime(),
            );
            if (diff <= windowMs) return true;
          }
        }
      }
      return false;
    });
  }

  // Filter by minLensOverlap
  entities = entities.filter(e => e.lensCount >= minOverlap);

  const lensesWithEvidence = [...new Set(entities.flatMap(e => e.presentInLenses))];

  return { type: joinConfig.by, entities, lensesWithEvidence };
}

function joinByCooccurrence(
  lensResults: LensResult[],
  temporalDays?: number,
): JoinResult {
  let lensesWithEvidence: string[];

  if (temporalDays) {
    const allTimestamps: Array<{ lensId: string; time: number }> = [];
    for (const lr of lensResults) {
      for (const si of lr.shapedItems) {
        allTimestamps.push({ lensId: lr.lensId, time: new Date(si.createdAt).getTime() });
      }
    }

    if (allTimestamps.length === 0) {
      return { type: 'cooccurrence', entities: [], lensesWithEvidence: [] };
    }

    const earliest = Math.min(...allTimestamps.map(t => t.time));
    const windowMs = temporalDays * MS_PER_DAY;
    const qualifying = allTimestamps.filter(t => t.time - earliest <= windowMs);
    lensesWithEvidence = [...new Set(qualifying.map(t => t.lensId))];
  } else {
    lensesWithEvidence = lensResults
      .filter(lr => lr.shapedItems.length > 0)
      .map(lr => lr.lensId);
  }

  return { type: 'cooccurrence', entities: [], lensesWithEvidence };
}

function joinByTemporal(
  lensResults: LensResult[],
  days: number,
): JoinResult {
  const windowMs = days * MS_PER_DAY;
  const lensTimes = new Map<string, number[]>();

  for (const lr of lensResults) {
    const times = lr.shapedItems.map(si => new Date(si.createdAt).getTime());
    if (times.length > 0) {
      lensTimes.set(lr.lensId, times);
    }
  }

  const qualifying = new Set<string>();
  const lensIds = [...lensTimes.keys()];

  for (let i = 0; i < lensIds.length; i++) {
    for (let j = i + 1; j < lensIds.length; j++) {
      if (qualifying.has(lensIds[i]) && qualifying.has(lensIds[j])) continue;

      const timesA = lensTimes.get(lensIds[i])!;
      const timesB = lensTimes.get(lensIds[j])!;

      let found = false;
      for (const ta of timesA) {
        if (found) break;
        for (const tb of timesB) {
          if (Math.abs(ta - tb) <= windowMs) {
            qualifying.add(lensIds[i]);
            qualifying.add(lensIds[j]);
            found = true;
            break;
          }
        }
      }
    }
  }

  return { type: 'temporal', entities: [], lensesWithEvidence: [...qualifying] };
}

// --- 4. Signal Evaluator ---

export function evaluateSignal(
  joinResult: JoinResult,
  signalConfig: SignalConfig,
  allLensIds: string[],
): SignalResult {
  // Validate combination lens IDs
  if (signalConfig.requires.type === 'combination') {
    const combos = signalConfig.requires.sufficient;
    if (!combos || combos.length === 0) {
      throw new WorkflowError(
        'signal.requires.sufficient must be provided for combination type',
        'validate',
      );
    }
    for (const combo of combos) {
      for (const lensId of combo) {
        if (!allLensIds.includes(lensId)) {
          throw new WorkflowError(
            `Unknown lens ID "${lensId}" in signal.requires.sufficient. Available: ${allLensIds.join(', ')}`,
            'validate',
          );
        }
      }
    }
  }

  const hasEntities = joinResult.entities.length > 0;

  if (hasEntities) {
    return evaluateSignalWithEntities(joinResult, signalConfig, allLensIds);
  }
  return evaluateSignalWithEvidence(joinResult, signalConfig, allLensIds);
}

function evaluateSignalWithEntities(
  joinResult: JoinResult,
  signalConfig: SignalConfig,
  allLensIds: string[],
): SignalResult {
  const { type, min, sufficient } = signalConfig.requires;

  let matchingEntities: JoinedEntity[];

  switch (type) {
    case 'all':
      matchingEntities = joinResult.entities.filter(
        e => allLensIds.every(id => e.presentInLenses.includes(id)),
      );
      break;
    case 'any':
      matchingEntities = joinResult.entities;
      break;
    case 'threshold':
      matchingEntities = joinResult.entities.filter(e => e.lensCount >= (min ?? 2));
      break;
    case 'combination': {
      matchingEntities = [];
      let matchedCombo: string[] | undefined;
      for (const combo of sufficient!) {
        const matching = joinResult.entities.filter(e =>
          combo.every(lensId => e.presentInLenses.includes(lensId)),
        );
        if (matching.length > 0) {
          matchingEntities = matching;
          matchedCombo = combo;
          break;
        }
      }
      const fired = matchingEntities.length > 0;
      return {
        fired,
        satisfiedBy: [...new Set(matchingEntities.flatMap(e => e.presentInLenses))],
        rule: type,
        matchedCombination: matchedCombo,
        entities: matchingEntities.map(e => e.entity),
      };
    }
  }

  const fired = matchingEntities.length > 0;
  return {
    fired,
    satisfiedBy: [...new Set(matchingEntities.flatMap(e => e.presentInLenses))],
    rule: type,
    entities: matchingEntities.map(e => e.entity),
  };
}

function evaluateSignalWithEvidence(
  joinResult: JoinResult,
  signalConfig: SignalConfig,
  allLensIds: string[],
): SignalResult {
  const evidence = joinResult.lensesWithEvidence;
  const { type, min, sufficient } = signalConfig.requires;

  let fired: boolean;
  let matchedCombination: string[] | undefined;

  switch (type) {
    case 'all':
      fired = allLensIds.every(id => evidence.includes(id));
      break;
    case 'any':
      fired = evidence.length > 0;
      break;
    case 'threshold':
      fired = evidence.length >= (min ?? 2);
      break;
    case 'combination':
      fired = false;
      for (const combo of sufficient!) {
        if (combo.every(lensId => evidence.includes(lensId))) {
          fired = true;
          matchedCombination = combo;
          break;
        }
      }
      break;
  }

  const result: SignalResult = {
    fired,
    satisfiedBy: evidence,
    rule: type,
    entities: [],
  };
  if (matchedCombination) result.matchedCombination = matchedCombination;
  return result;
}

// --- 5. Delta Computer ---

export function computeDelta(
  current: SnapshotData,
  previous: SnapshotData,
): Delta {
  // New shaped items per lens
  const newShapedItems: Record<string, number> = {};
  for (const [lensId, lens] of Object.entries(current.lenses)) {
    const prevCount = previous.lenses[lensId]?.shapedCount ?? 0;
    newShapedItems[lensId] = Math.max(0, lens.shapedCount - prevCount);
  }

  // New/lost joins by entity name (URL fallback)
  const currentEntityKeys = new Set(
    current.join.entities.map(e => e.url || e.entity),
  );
  const previousEntityKeys = new Set(
    previous.join.entities.map(e => e.url || e.entity),
  );

  const newJoins = [...currentEntityKeys].filter(k => !previousEntityKeys.has(k));
  const lostJoins = [...previousEntityKeys].filter(k => !currentEntityKeys.has(k));

  // Signal transition
  const currentEntityNames = new Set(current.signal.entities);
  const previousEntityNames = new Set(previous.signal.entities);

  const signalTransition = {
    was: previous.signal.fired,
    now: current.signal.fired,
    changed: previous.signal.fired !== current.signal.fired,
    newEntities: [...currentEntityNames].filter(n => !previousEntityNames.has(n)),
    lostEntities: [...previousEntityNames].filter(n => !currentEntityNames.has(n)),
  };

  // Time since last eval
  const prevTime = new Date(previous.evaluatedAt).getTime();
  const currTime = new Date(current.evaluatedAt).getTime();
  const diffMs = currTime - prevTime;
  const timeSinceLastEval = formatDuration(diffMs);

  return { newShapedItems, newJoins, lostJoins, signalTransition, timeSinceLastEval };
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

// --- 6. Snapshot Builder ---

export function buildSnapshot(
  lensResults: LensResult[],
  joinResult: JoinResult,
  signalResult: SignalResult,
  websetIds: Record<string, string>,
): SnapshotData {
  const lenses: SnapshotData['lenses'] = {};
  for (const lr of lensResults) {
    lenses[lr.lensId] = {
      websetId: websetIds[lr.lensId],
      totalItems: lr.totalItems,
      shapedCount: lr.shapedItems.length,
      shapes: lr.shapedItems.map(si => ({
        name: si.name,
        url: si.url,
        enrichments: si.enrichments,
      })),
    };
  }

  return {
    evaluatedAt: new Date().toISOString(),
    lenses,
    join: joinResult,
    signal: signalResult,
  };
}

// --- Helpers ---

function extractEnrichmentMap(webset: any): Map<string, string> {
  const map = new Map<string, string>();
  const defs = webset.enrichments as Array<{ id: string; description: string }> | undefined;
  if (defs) {
    for (const def of defs) map.set(def.id, def.description);
  }
  return map;
}

// --- 7. Main Workflow ---

async function semanticCronWorkflow(
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
): Promise<unknown> {
  const startTime = Date.now();
  const tracker = createStepTracker();

  const rawConfig = args.config as SemanticCronConfig;
  const variables = args.variables as Record<string, string> | undefined;
  const existingWebsets = args.existingWebsets as Record<string, string> | undefined;
  const previousSnapshot = args.previousSnapshot as SnapshotData | undefined;
  const timeoutMs = (args.timeout as number) ?? DEFAULT_TIMEOUT_MS;

  // Step 0: Validate + expand templates
  const step0 = Date.now();
  store.updateProgress(taskId, { step: 'validating', completed: 0, total: 8 });

  if (!rawConfig || typeof rawConfig !== 'object' || !Array.isArray(rawConfig.lenses) || rawConfig.lenses.length === 0) {
    throw new WorkflowError('config.lenses is required and must be non-empty', 'validate');
  }
  if (!rawConfig.shapes || rawConfig.shapes.length === 0) {
    throw new WorkflowError('config.shapes is required and must be non-empty', 'validate');
  }
  if (!rawConfig.join) {
    throw new WorkflowError('config.join is required', 'validate');
  }
  if (!rawConfig.signal) {
    throw new WorkflowError('config.signal is required', 'validate');
  }
  if (rawConfig.lenses.length > MAX_LENSES) {
    throw new WorkflowError(`Maximum ${MAX_LENSES} lenses allowed (got ${rawConfig.lenses.length})`, 'validate');
  }

  const config = variables ? expandTemplates(rawConfig, variables) : rawConfig;

  // Validate shape lens IDs and condition counts
  const lensIds = config.lenses.map(l => l.id);
  for (const shape of config.shapes) {
    if (!lensIds.includes(shape.lensId)) {
      throw new WorkflowError(
        `Shape references unknown lens "${shape.lensId}". Available: ${lensIds.join(', ')}`,
        'validate',
      );
    }
    if (shape.conditions.length > MAX_CONDITIONS_PER_SHAPE) {
      throw new WorkflowError(
        `Maximum ${MAX_CONDITIONS_PER_SHAPE} conditions per shape (got ${shape.conditions.length})`,
        'validate',
      );
    }
  }

  tracker.track('validate', step0);

  if (isCancelled(taskId, store)) return null;

  const isReeval = !!existingWebsets;
  const websetIds: Record<string, string> = existingWebsets ? { ...existingWebsets } : {};
  const enrichmentMaps: Record<string, Map<string, string>> = {};
  const totalLenses = config.lenses.length;
  let anyTimedOut = false;

  // Step 1: Create or fetch websets
  if (!isReeval) {
    for (let i = 0; i < config.lenses.length; i++) {
      const stepStart = Date.now();
      const lens = config.lenses[i];

      store.updateProgress(taskId, {
        step: `creating lens ${i + 1}/${totalLenses}: ${lens.id}`,
        completed: 1,
        total: 8,
        message: `Lens ${i + 1} of ${totalLenses}`,
      });

      if (isCancelled(taskId, store)) {
        for (const id of Object.values(websetIds)) {
          await exa.websets.cancel(id);
        }
        return null;
      }

      // Exa SDK types are incomplete for dynamic webset creation params
      let webset: any;

      if (lens.source.websetId) {
        websetIds[lens.id] = lens.source.websetId;
        webset = await exa.websets.get(lens.source.websetId);
      } else {
        const createParams: Record<string, unknown> = {
          search: {
            query: lens.source.query,
            count: lens.source.count ?? 50,
          },
        };

        const search = createParams.search as Record<string, unknown>;
        if (lens.source.entity) search.entity = lens.source.entity;
        if (lens.source.criteria) search.criteria = lens.source.criteria;
        if (lens.source.enrichments) {
          createParams.enrichments = lens.source.enrichments;
        }

        webset = await exa.websets.create(createParams as any);
        websetIds[lens.id] = webset.id;
      }

      enrichmentMaps[lens.id] = extractEnrichmentMap(webset);
      tracker.track(`create-${lens.id}`, stepStart);
    }
  } else {
    for (let i = 0; i < config.lenses.length; i++) {
      const lens = config.lenses[i];
      const wsId = websetIds[lens.id];
      if (!wsId) {
        throw new WorkflowError(
          `existingWebsets missing ID for lens "${lens.id}"`,
          'validate',
        );
      }

      store.updateProgress(taskId, {
        step: `fetching lens ${i + 1}/${totalLenses}: ${lens.id}`,
        completed: 1,
        total: 8,
      });

      const webset = await exa.websets.get(wsId);
      enrichmentMaps[lens.id] = extractEnrichmentMap(webset);
    }
  }

  if (isCancelled(taskId, store)) {
    if (!isReeval) {
      for (const id of Object.values(websetIds)) {
        await exa.websets.cancel(id);
      }
    }
    return null;
  }

  // Save partial result checkpoint
  store.setPartialResult(taskId, { websetIds });

  // Step 2: Poll websets (initial run only)
  if (!isReeval) {
    for (let i = 0; i < config.lenses.length; i++) {
      const lens = config.lenses[i];
      if (lens.source.websetId) continue;

      const stepStart = Date.now();
      store.updateProgress(taskId, {
        step: `polling lens ${i + 1}/${totalLenses}: ${lens.id}`,
        completed: 2,
        total: 8,
      });

      const { timedOut } = await pollUntilIdle({
        exa,
        websetId: websetIds[lens.id],
        taskId,
        store,
        timeoutMs,
        stepNum: 2,
        totalSteps: 8,
      });

      if (timedOut) anyTimedOut = true;
      tracker.track(`poll-${lens.id}`, stepStart);

      if (isCancelled(taskId, store)) {
        for (const id of Object.values(websetIds)) {
          await exa.websets.cancel(id);
        }
        return null;
      }
    }
  }

  // Steps 3-8: Collect, shape, join, signal — wrapped for cleanup on exception
  try {
    // Step 3: Collect items + resolve enrichments
    const stepCollect = Date.now();
    store.updateProgress(taskId, { step: 'collecting items', completed: 3, total: 8 });

    const lensResults: LensResult[] = [];

    for (const lens of config.lenses) {
      const wsId = websetIds[lens.id];
      const rawItems = await collectItems(exa, wsId);

      // Filter to items with satisfied evaluation
      const passingItems = rawItems.filter(item => {
        const evaluations = item.evaluations as
          | Array<{ satisfied: string }>
          | undefined;
        if (!evaluations || evaluations.length === 0) return true;
        return evaluations.some(e => e.satisfied === 'yes');
      });

      // Resolve enrichment descriptions
      const resolved = resolveEnrichmentDescriptions(passingItems, enrichmentMaps[lens.id]);

      // Apply shape evaluation
      const shapesForLens = config.shapes.filter(s => s.lensId === lens.id);

      const shapedItems: ShapedItem[] = [];
      for (const { item, enrichments } of resolved) {
        const passes =
          shapesForLens.length === 0 ||
          shapesForLens.some(shape => evaluateShape(shape, enrichments));

        if (passes) {
          const projected = projectItem(item);
          const enrichmentValues: Record<string, unknown> = {};
          for (const e of enrichments) {
            enrichmentValues[e.description] = e.result?.[0] ?? null;
          }

          shapedItems.push({
            id: (item.id as string) ?? '',
            name: (projected.name as string) ?? '',
            url: (projected.url as string) ?? '',
            enrichments: enrichmentValues,
            createdAt: (item.createdAt as string) ?? new Date().toISOString(),
          });
        }
      }

      lensResults.push({
        lensId: lens.id,
        websetId: wsId,
        totalItems: rawItems.length,
        shapedItems,
      });
    }

    tracker.track('collect-shape', stepCollect);

    if (isCancelled(taskId, store)) return null;

    // Step 4: Join
    const stepJoin = Date.now();
    store.updateProgress(taskId, { step: 'joining lenses', completed: 4, total: 8 });
    const joinResult = joinLensResults(lensResults, config.join);
    tracker.track('join', stepJoin);

    // Step 5: Evaluate signal
    const stepSignal = Date.now();
    store.updateProgress(taskId, { step: 'evaluating signal', completed: 5, total: 8 });
    const signalResult = evaluateSignal(joinResult, config.signal, lensIds);
    tracker.track('signal', stepSignal);

    // Step 6: Build snapshot
    store.updateProgress(taskId, { step: 'building snapshot', completed: 6, total: 8 });
    const snapshot = buildSnapshot(lensResults, joinResult, signalResult, websetIds);

    // Step 7: Create monitors (initial run only, non-fatal)
    const monitorErrors: string[] = [];
    if (!isReeval && config.monitor) {
      const stepMon = Date.now();
      store.updateProgress(taskId, { step: 'creating monitors', completed: 7, total: 8 });

      for (const lens of config.lenses) {
        try {
          await (exa.websets.monitors as any).create(websetIds[lens.id], {
            schedule: {
              cron: config.monitor.cron,
              timezone: config.monitor.timezone,
            },
          });
        } catch (err) {
          monitorErrors.push(`${lens.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      tracker.track('monitors', stepMon);
    }

    store.updateProgress(taskId, { step: 'complete', completed: 8, total: 8 });

    const duration = Date.now() - startTime;

    // Build result
    const totalShaped = lensResults.reduce((sum, lr) => sum + lr.shapedItems.length, 0);
    const totalItems = lensResults.reduce((sum, lr) => sum + lr.totalItems, 0);

    const result: Record<string, unknown> = {
      websetIds,
      snapshot,
      duration,
      steps: tracker.steps,
    };

    if (anyTimedOut) result.timedOut = true;
    if (monitorErrors.length > 0) result.monitorErrors = monitorErrors;

    if (isReeval && previousSnapshot) {
      result.delta = computeDelta(snapshot, previousSnapshot);
    }

    const signalStr = signalResult.fired
      ? `FIRED (${signalResult.entities.length} entities)`
      : 'not fired';

    return withSummary(
      result,
      `${totalLenses} lenses, ${totalItems} items → ${totalShaped} shaped, ${joinResult.entities.length} joined entities, signal: ${signalStr} in ${(duration / 1000).toFixed(0)}s`,
    );
  } catch (err) {
    // Clean up created websets on unexpected failure
    if (!isReeval) {
      for (const id of Object.values(websetIds)) {
        try { await exa.websets.cancel(id); } catch { /* best effort */ }
      }
    }
    throw err;
  }
}

// Register
registerWorkflow('semantic.cron', semanticCronWorkflow);
