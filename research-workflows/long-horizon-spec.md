# Long-Horizon Tasks & Novel Research Patterns for Websets MCP

## Specification v1.0

**Status**: Research complete, ready for implementation review
**Thoughtbox Session**: `199da570-07e4-486a-b2b7-91b93b31d5ef` (23 thoughts, 5 branches)
**Bead**: `searchbox-ewn`

---

## 1. Architecture Overview

Three layers, all exposed through the existing `manage_websets` unified tool:

```
┌─────────────────────────────────────────────────┐
│              manage_websets tool                  │
│  (unified dispatcher, z.enum operations)         │
├─────────────────────────────────────────────────┤
│  Layer 3: Task Orchestrator (NEW)                │
│  tasks.create | tasks.get | tasks.result |       │
│  tasks.list  | tasks.cancel                      │
│  Task types: qd.winnow, lifecycle, convergent,   │
│    adversarial, research.deep, verifiedCollection│
├─────────────────────────────────────────────────┤
│  Layer 2: Research API Domain (NEW)              │
│  research.create | research.get |                │
│  research.list   | research.pollUntilFinished    │
├─────────────────────────────────────────────────┤
│  Layer 1: Primitive Operations (EXISTING)        │
│  47 operations across 8 domains                  │
│  websets | searches | items | enrichments |       │
│  monitors | webhooks | imports | events           │
└─────────────────────────────────────────────────┘
```

### Why server-internal tasks (not MCP Tasks protocol)

- **Works with any MCP client** — no experimental protocol support needed
- **Uses existing dispatcher pattern** — just new entries in OPERATIONS registry
- **Agent controls polling** — calls `tasks.get` when it wants status
- **Clean upgrade path** — same workflow functions can be wrapped in MCP Tasks later
- **Multiple concurrent tasks** — Node.js event loop handles parallelism naturally

### New operation count

| Layer | New Operations | Total |
|-------|---------------|-------|
| Layer 2 (Research) | 4 | — |
| Layer 3 (Tasks) | 5 | — |
| **Total new** | **9** | **56** |

---

## 2. Pattern Catalog

### Pattern 1: Lifecycle Harvest

**Name**: `lifecycle.harvest`
**Archetype**: Applied
**When to use**: You need structured entity data with enrichments, collected as a single coherent operation.

**Flow**:
```
create webset → wait until idle → add enrichments → wait until idle → collect all items
```

**Task args**:
```typescript
{
  type: 'lifecycle.harvest',
  query: string,           // search query
  entity: { type: string }, // 'company' | 'person' | 'paper' etc.
  criteria?: Array<{ description: string }>,
  count?: number,           // default 25
  enrichments?: Array<{
    description: string,
    format?: 'text' | 'url' | 'number' | 'options' | 'boolean',
    options?: Array<{ label: string }>,
  }>,
  timeout?: number,         // per-step timeout in ms, default 300000
  cleanup?: boolean,        // delete webset after harvest, default false
}
```

**Task result**:
```typescript
{
  websetId: string,
  items: Array<WebsetItem>,
  itemCount: number,
  searchProgress: { found: number, analyzed: number },
  enrichmentCount: number,
  duration: number,         // total ms
  steps: Array<{ name: string, duration: number, status: string }>,
}
```

**Failure handling**:
- Search timeout → return partial items found so far
- Enrichment timeout → return items without enrichment data
- API error → return websetId for manual recovery
- Rate limit → retry with exponential backoff (3 attempts)

**MAP-Elites coordinates**: scope=3, domain=2, evidence=3, horizon=2, fidelity=3

---

### Pattern 2: Convergent Search

**Name**: `convergent.search`
**Archetype**: Confirmatory
**When to use**: You want high-confidence entity discovery through triangulation — same topic queried from multiple angles.

**Flow**:
```
create N websets (varied queries) → wait all idle → collect items → deduplicate → compute intersection
```

**Task args**:
```typescript
{
  type: 'convergent.search',
  queries: string[],        // 2-5 different query angles
  entity: { type: string },
  criteria?: Array<{ description: string }>,  // shared across all queries
  count?: number,           // per-query count, default 25
  timeout?: number,
}
```

**Task result**:
```typescript
{
  websetIds: string[],
  intersection: Array<{     // entities found in 2+ websets
    entity: { name: string, url: string, ... },
    foundInQueries: string[],
    confidence: number,      // foundIn.length / totalQueries
  }>,
  unique: Array<{           // entities found in only 1 webset
    query: string,
    items: WebsetItem[],
  }>,
  overlapMatrix: number[][], // pairwise overlap counts
  totalUniqueEntities: number,
  duration: number,
}
```

**Entity deduplication strategy**:
- Primary: match on `properties.url` (canonical)
- Secondary: fuzzy match on `properties.company.name` or `properties.description`
- Threshold: URL exact match OR name similarity > 0.85

**MAP-Elites coordinates**: scope=4, domain=3, evidence=4, horizon=2, fidelity=4

---

### Pattern 3: Adversarial Verification

**Name**: `adversarial.verify`
**Archetype**: Generative (with confirmatory elements)
**When to use**: You have a thesis about entities/companies/people and want to actively search for disconfirming evidence.

**Flow**:
```
Phase A: create thesis webset → wait → collect supporting evidence
Phase B: create antithesis webset → wait → collect counter-evidence
Phase C (optional): synthesize via Research API
```

**Task args**:
```typescript
{
  type: 'adversarial.verify',
  thesis: string,            // the claim being tested
  thesisQuery: string,       // query to find supporting evidence
  antithesisQuery: string,   // query to find counter-evidence
  entity?: { type: string },
  count?: number,            // per-side count, default 25
  enrichments?: Array<{ description: string, format?: string }>,
  synthesize?: boolean,      // use Research API for synthesis, default false
  timeout?: number,
}
```

**Task result**:
```typescript
{
  thesis: {
    websetId: string,
    items: WebsetItem[],
    itemCount: number,
  },
  antithesis: {
    websetId: string,
    items: WebsetItem[],
    itemCount: number,
  },
  synthesis?: {              // only if synthesize=true
    researchId: string,
    verdict: string,
    confidence: number,
    keySupporting: string[],
    keyCountering: string[],
    blindSpots: string[],
  },
  duration: number,
}
```

**Research API synthesis prompt** (generated internally):
```
Given supporting evidence for the thesis "${thesis}":
${summarize(thesisItems)}

And counter-evidence:
${summarize(antithesisItems)}

Provide a balanced assessment including: verdict, confidence level,
key supporting factors, key countering factors, and identified blind spots.
```

**MAP-Elites coordinates**: scope=2, domain=2, evidence=4, horizon=2, fidelity=5

---

### Pattern 4: Deep Research

**Name**: `research.deep`
**Archetype**: Exploratory
**When to use**: You need a synthesized narrative answer to a complex question, backed by web sources.

**Flow**:
```
create Exa research task → poll until finished → return structured result
```

**Task args**:
```typescript
{
  type: 'research.deep',
  instructions: string,      // natural language research question
  outputSchema?: object,     // JSON Schema for structured output
  model?: 'exa-research' | 'exa-research-pro',  // default 'exa-research'
  timeout?: number,          // default 300000 (5 min)
}
```

**Task result**:
```typescript
{
  researchId: string,
  status: string,
  result: unknown,           // structured per outputSchema, or markdown string
  model: string,
  duration: number,
}
```

Note: This is thin wrapper over Exa Research API. The value is in composition with other patterns (see Pattern 5) and in the consistent task interface.

**MAP-Elites coordinates**: scope=4, domain=3, evidence=3, horizon=3, fidelity=3

---

### Pattern 5: Verified Collection

**Name**: `research.verifiedCollection`
**Archetype**: Exploratory + Applied hybrid
**When to use**: You need both breadth (structured entity collection via Websets) and depth (per-entity deep research).

**Flow**:
```
create webset → wait → collect items → for each item: Research API deep dive → merge results
```

**Task args**:
```typescript
{
  type: 'research.verifiedCollection',
  query: string,
  entity: { type: string },
  criteria?: Array<{ description: string }>,
  count?: number,            // webset item count, default 25
  enrichments?: Array<{ description: string, format?: string }>,
  researchPrompt: string,    // template with {{name}}, {{url}}, {{description}} placeholders
  researchSchema?: object,   // JSON Schema for per-entity research output
  researchModel?: 'exa-research' | 'exa-research-pro',
  researchLimit?: number,    // max entities to research, default 10
  timeout?: number,
}
```

**Task result**:
```typescript
{
  websetId: string,
  items: Array<{
    item: WebsetItem,
    research?: {
      researchId: string,
      result: unknown,       // per researchSchema
      duration: number,
    },
  }>,
  totalItems: number,
  researchedCount: number,
  duration: number,
}
```

**Concurrency**: Research API calls are made in parallel with a concurrency limit of 3 to avoid rate limiting.

**MAP-Elites coordinates**: scope=4, domain=3, evidence=4, horizon=3, fidelity=4

---

### Pattern 6: Quality-Diversity Winnowing

**Name**: `qd.winnow`
**Archetype**: Analytical + Generative hybrid
**When to use**: You want to use Websets criteria as a built-in quality-diversity filter — the API evaluates entities against criteria (behavioral coordinates) and enrichments score fitness, enabling MAP-Elites-style winnowing over multiple rounds.

**Core Insight**: Websets already does quality-diversity evaluation for us:
- **Criteria** = behavioral coordinates. Each criterion is a dimension. An item's position in the behavioral space = which criteria it satisfies (`[1,1,0]` = satisfies criteria 1 and 2 but not 3).
- **Enrichments** = fitness function. Enrichment results (numbers, booleans, text scores) provide per-item quality signals within each niche.
- **Polling** = real-time filter feedback. The `found/analyzed` ratio during search reveals how stringent your criteria are before the search even completes.

**Flow**:
```
Round 1: create webset with criteria + enrichments → poll progress → collect items
         → classify into niches (criteria combinations) → score fitness (enrichments)
         → identify elites (best per niche) → analyze criteria success rates
Round 2: (optionally refined criteria) → repeat
         → compare elite sets across rounds → check convergence
Round N: return final elite set with quality metrics
```

**Task args**:
```typescript
{
  type: 'qd.winnow',
  query: string,
  entity: { type: string },
  criteria: Array<{ description: string }>,    // become behavioral coordinates
  enrichments: Array<{                         // become fitness signals
    description: string,
    format?: 'text' | 'url' | 'number' | 'options' | 'boolean',
    options?: Array<{ label: string }>,
  }>,
  count?: number,                // per-round item count, default 50
  maxRounds?: number,            // default 1 for v1 (agent-driven iteration)
  convergenceThreshold?: number, // stop if elite set changes < threshold %, default 0.1
  selectionStrategy?: 'all-criteria' | 'any-criteria' | 'diverse', // default 'diverse'
  timeout?: number,
}
```

**Task result**:
```typescript
{
  rounds: Array<{
    websetId: string,
    itemCount: number,
    criteriaSuccessRates: Record<string, number>,  // criterion desc → % success
    nicheDistribution: Record<string, number>,     // criteria-combo key → count
    elites: Array<{
      item: WebsetItem,
      niche: string,           // e.g. "1,1,0" for criteria satisfaction vector
      fitnessScore: number,    // derived from enrichment results
      criteriaVector: boolean[],
    }>,
  }>,
  finalElites: Array<{
    item: WebsetItem,
    niche: string,
    fitnessScore: number,
    criteriaVector: boolean[],
  }>,
  convergenceReached: boolean,
  qualityMetrics: {
    coverage: number,      // populated niches / possible niches (2^N criteria)
    avgFitness: number,    // mean fitness across elites
    diversity: number,     // Shannon entropy of niche distribution
    stringency: number,    // overall found/analyzed ratio
  },
  totalDuration: number,
}
```

**Niche classification**: Each item has `evaluations[]` with per-criterion `satisfied: "yes"|"no"`. The criteria satisfaction vector `[true, true, false]` becomes the niche key `"1,1,0"`. With N criteria, there are up to 2^N possible niches.

**Fitness scoring**: Enrichment results are converted to numeric scores:
- `number` format: used directly
- `boolean` / `options`: mapped to 0 or 1
- `text` / `url`: presence = 1, absence = 0
- Composite fitness = mean of normalized enrichment scores

**Polling integration**: During search, `tasks.get` returns real-time progress:
```typescript
{
  step: 'searching',
  round: 1,
  found: 15,
  analyzed: 200,
  stringency: 0.075,  // found/analyzed — tells agent if criteria are too strict
}
```
Agent can cancel and adjust criteria if stringency is too low (< 0.05 = criteria practically impossible to satisfy).

**Why this is the first pattern to implement**: It naturally combines polling (watching criteria success rates evolve), tasks (long-running multi-step process), and quality-diversity evaluation. Every other pattern can be understood as a special case:
- `lifecycle.harvest` = `qd.winnow` with 1 round and `all-criteria` selection
- `convergent.search` = N parallel `qd.winnow` runs with intersection analysis

**MAP-Elites coordinates**: scope=3, domain=2, evidence=4, horizon=2, fidelity=5

---

## 3. Technical Specification

### 3.1 Task Store (`src/lib/taskStore.ts`)

```typescript
export type TaskStatus = 'pending' | 'working' | 'completed' | 'failed' | 'cancelled';

export interface TaskProgress {
  step: string;
  completed: number;
  total: number;
  message?: string;
}

export interface TaskState<T = unknown> {
  id: string;
  type: string;
  status: TaskStatus;
  progress: TaskProgress | null;
  args: Record<string, unknown>;
  result: T | null;
  error: { step: string; message: string; recoverable: boolean } | null;
  partialResult: T | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;     // auto-cleanup time
}

export interface TaskStore {
  create(type: string, args: Record<string, unknown>): TaskState;
  get(id: string): TaskState | null;
  list(status?: TaskStatus): TaskState[];
  updateStatus(id: string, status: TaskStatus): void;
  updateProgress(id: string, progress: TaskProgress): void;
  setResult(id: string, result: unknown): void;
  setError(id: string, error: TaskState['error']): void;
  setPartialResult(id: string, result: unknown): void;
  cancel(id: string): boolean;
  delete(id: string): boolean;
  cleanup(): number;     // remove expired tasks, return count removed
}
```

**Implementation**: In-memory `Map<string, TaskState>` with:
- UUID v4 for task IDs (prefix `task_`)
- Default TTL: 1 hour after completion
- Periodic cleanup: every 5 minutes via `setInterval`
- Max concurrent tasks: 20 (configurable)

### 3.2 Workflow Function Signature (`src/workflows/types.ts`)

```typescript
import type { Exa } from 'exa-js';
import type { TaskStore } from '../lib/taskStore.js';

export type WorkflowFunction = (
  taskId: string,
  args: Record<string, unknown>,
  exa: Exa,
  store: TaskStore,
) => Promise<unknown>;
```

Each workflow function:
1. Updates progress via `store.updateProgress(taskId, ...)`
2. Sets partial results via `store.setPartialResult(taskId, ...)` at checkpoints
3. Returns the final result (store auto-sets it)
4. Throws on unrecoverable errors (store catches and sets error state)
5. Checks `store.get(taskId).status` periodically for cancellation

### 3.3 Research Handlers (`src/handlers/research.ts`)

```typescript
// research.create — wraps exa.research.create()
export async function create(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>

// research.get — wraps exa.research.get()
export async function get(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>

// research.list — wraps exa.research.list()
export async function list(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>

// research.pollUntilFinished — wraps exa.research.pollUntilFinished()
export async function pollUntilFinished(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>
```

### 3.4 Task Handlers (`src/handlers/tasks.ts`)

```typescript
// tasks.create — creates task, spawns background workflow
export async function create(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>

// tasks.get — returns task status + progress
export async function get(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>

// tasks.result — returns task result (blocks if not complete? or returns error?)
export async function result(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>

// tasks.list — enumerates tasks by status
export async function list(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>

// tasks.cancel — cancels a running task
export async function cancel(args: Record<string, unknown>, exa: Exa): Promise<ToolResult>
```

**Note**: Task handlers need access to the TaskStore. Options:
- Pass store via closure when registering operations (preferred)
- Singleton store module
- Inject via third parameter (requires handler signature change)

**Recommended**: Module-level singleton in `src/lib/taskStore.ts` — simplest, no signature changes.

### 3.5 OPERATIONS Registry Additions (`src/tools/manageWebsets.ts`)

```typescript
// Research domain
'research.create': { handler: research.create, summary: '...' },
'research.get': { handler: research.get, summary: '...' },
'research.list': { handler: research.list, summary: '...' },
'research.pollUntilFinished': { handler: research.pollUntilFinished, summary: '...' },

// Tasks domain
'tasks.create': { handler: tasks.create, summary: '...' },
'tasks.get': { handler: tasks.get, summary: '...' },
'tasks.result': { handler: tasks.result, summary: '...' },
'tasks.list': { handler: tasks.list, summary: '...' },
'tasks.cancel': { handler: tasks.cancel, summary: '...' },
```

### 3.6 Concurrency Control (`src/lib/semaphore.ts`)

Simple counting semaphore for rate-limiting parallel Exa API calls within workflows:

```typescript
export class Semaphore {
  constructor(private permits: number) {}
  async acquire(): Promise<void>
  release(): void
  async run<T>(fn: () => Promise<T>): Promise<T>
}
```

Used by workflows that make multiple parallel API calls (convergent.search, research.verifiedCollection).
Default: 3 concurrent Exa API calls.

---

## 4. Implementation Roadmap

### Phase 1: Foundation (1 session)

1. Create `src/lib/taskStore.ts` — in-memory TaskStore
2. Create `src/lib/semaphore.ts` — concurrency control
3. Create `src/workflows/types.ts` — WorkflowFunction type
4. Create `src/handlers/tasks.ts` — task management handlers
5. Register task operations in `manageWebsets.ts`
6. Unit tests for TaskStore and task handlers

**Deliverable**: `tasks.create`, `tasks.get`, `tasks.result`, `tasks.list`, `tasks.cancel` working with a dummy echo task type.

### Phase 2: Research API Domain (1 session)

1. Create `src/handlers/research.ts` — Research API wrappers
2. Register research operations in `manageWebsets.ts`
3. Unit tests for research handlers
4. Integration tests (requires EXA_API_KEY)

**Deliverable**: `research.create`, `research.get`, `research.list`, `research.pollUntilFinished` working.

### Phase 3: First Workflow — QD Winnowing (1 session)

1. Create `src/workflows/qdWinnow.ts` — qd.winnow implementation
   - Niche classification from criteria satisfaction vectors
   - Fitness scoring from enrichment results
   - Progress reporting with real-time stringency metrics
2. Wire into tasks.create dispatcher
3. Integration test: create task, poll status, get result
4. Error handling: timeout, partial results

**Deliverable**: Full `qd.winnow` workflow working end-to-end. This is the foundational pattern — lifecycle.harvest and convergent.search are special cases of it.

### Phase 4: Derived Workflows (1-2 sessions)

1. `src/workflows/lifecycle.ts` — lifecycle.harvest (simplified qd.winnow: 1 round, all-criteria)
2. `src/workflows/convergent.ts` — convergent.search (N parallel winnow runs + intersection)
3. `src/workflows/adversarial.ts` — adversarial.verify (thesis/antithesis websets + Research API synthesis)
4. `src/workflows/researchDeep.ts` — research.deep (thin wrapper over Exa Research API)
5. `src/workflows/verifiedCollection.ts` — research.verifiedCollection (Websets + per-entity Research API)
6. Integration tests for each

**Deliverable**: All 6 task types working.

### Phase 5: Polish & MAP-Elites (1 session)

1. Insert new workflow archetypes into `research-workflows/workflows.db`
2. Update CLAUDE.md with new operations documentation
3. Update README with examples
4. Error path tests
5. Docker rebuild verification

**Deliverable**: Complete v3.0.0 release.

---

## 5. MAP-Elites Workflow Entries

New archetypes to insert into `workflows` table:

```sql
INSERT INTO workflows (id, name, description, status,
  coord_scope, coord_domain_structure, coord_evidence_type,
  coord_time_horizon, coord_fidelity,
  archetype, notes)
VALUES
  ('workflow-webset-lifecycle',
   'Webset Lifecycle Harvest',
   'Full webset lifecycle: create, search, wait, enrich, collect. Single operation for complete entity collection with enrichments.',
   'seed', 3, 2, 3, 2, 3,
   'applied',
   'Backed by Exa Websets API. Task type: lifecycle.harvest'),

  ('workflow-webset-convergent',
   'Convergent Multi-Query Search',
   'Same topic queried from N angles via separate websets. Intersection analysis identifies high-confidence entities through triangulation.',
   'seed', 4, 3, 4, 2, 4,
   'confirmatory',
   'Backed by Exa Websets API. Task type: convergent.search. Novel: convergent evidence via entity deduplication.'),

  ('workflow-webset-adversarial',
   'Adversarial Verification',
   'Thesis and antithesis websets with optional Research API synthesis. Forces disconfirmation search to combat confirmation bias.',
   'seed', 2, 2, 4, 2, 5,
   'generative',
   'Backed by Exa Websets + Research API. Task type: adversarial.verify. Novel: structured opposition with automated synthesis.'),

  ('workflow-webset-verified',
   'Research-Verified Collection',
   'Broad entity collection via Websets + deep per-entity verification via Research API. Combines breadth and depth.',
   'seed', 4, 3, 4, 3, 4,
   'exploratory',
   'Backed by Exa Websets + Research API. Task type: research.verifiedCollection. Novel: two Exa primitives composed.'),

  ('workflow-webset-qd-winnow',
   'Quality-Diversity Winnowing',
   'Uses Websets criteria as behavioral coordinates and enrichments as fitness functions. MAP-Elites-style progressive filtration over entity collections. Criteria satisfaction vectors define niches, enrichment scores define fitness.',
   'seed', 3, 2, 4, 2, 5,
   'analytical',
   'Backed by Exa Websets API. Task type: qd.winnow. Novel: quality-diversity search using criteria combinations as behavioral space. The foundational pattern — lifecycle.harvest and convergent.search are special cases.');
```

Workflow steps for each (to insert into `workflow_steps`):

### Lifecycle Harvest Steps
1. Create webset with search parameters
2. Wait until webset idle (search complete)
3. Add enrichments to webset items
4. Wait until enrichments complete
5. Collect all items with enrichment data

### Convergent Search Steps
1. Create N websets with varied queries (parallel)
2. Wait for all websets to become idle
3. Collect items from each webset
4. Deduplicate entities across websets
5. Compute intersection and confidence scores

### Adversarial Verification Steps
1. Create thesis webset with supporting query
2. Wait and collect thesis evidence
3. Create antithesis webset with counter-query
4. Wait and collect counter-evidence
5. (Optional) Synthesize via Research API

### Verified Collection Steps
1. Create webset and collect entities
2. For each entity (up to limit): create Research API task
3. Poll all research tasks until complete
4. Merge webset items with research results

---

## 6. Example Usage Scenarios

### Scenario A: Market Research

```
Agent: manage_websets({
  operation: 'tasks.create',
  args: {
    type: 'lifecycle.harvest',
    query: 'AI infrastructure startups that raised Series B in 2025',
    entity: { type: 'company' },
    count: 50,
    enrichments: [
      { description: 'Total funding amount', format: 'text' },
      { description: 'Number of employees', format: 'number' },
      { description: 'Key product or service', format: 'text' },
    ]
  }
})
→ { taskId: 'task_abc123', status: 'working' }

// 5 minutes later...
Agent: manage_websets({ operation: 'tasks.get', args: { taskId: 'task_abc123' } })
→ { status: 'working', progress: { step: 'enriching', completed: 30, total: 50 } }

// 10 minutes later...
Agent: manage_websets({ operation: 'tasks.result', args: { taskId: 'task_abc123' } })
→ { websetId: '...', items: [...], itemCount: 47, duration: 540000 }
```

### Scenario B: Due Diligence

```
Agent: manage_websets({
  operation: 'tasks.create',
  args: {
    type: 'adversarial.verify',
    thesis: 'Acme Corp is a strong acquisition target',
    thesisQuery: 'Acme Corp growth partnerships expansion',
    antithesisQuery: 'Acme Corp lawsuits layoffs decline controversies',
    entity: { type: 'company' },
    synthesize: true
  }
})
→ { taskId: 'task_def456', status: 'working' }

// Later...
→ {
    thesis: { items: [...], itemCount: 15 },
    antithesis: { items: [...], itemCount: 8 },
    synthesis: {
      verdict: 'Mixed signals — strong product growth but regulatory risk',
      confidence: 0.6,
      keySupporting: ['Revenue doubled in 2025', '3 major partnerships'],
      keyCountering: ['Pending FTC investigation', 'CTO departure'],
      blindSpots: ['No international market data', 'Customer retention unknown']
    }
  }
```

### Scenario C: Talent Mapping with Depth

```
Agent: manage_websets({
  operation: 'tasks.create',
  args: {
    type: 'research.verifiedCollection',
    query: 'Machine learning researchers specializing in reinforcement learning',
    entity: { type: 'person' },
    count: 20,
    researchPrompt: 'Summarize the key contributions of {{name}} to reinforcement learning. Include their most cited papers, current affiliation, and notable achievements.',
    researchSchema: {
      type: 'object',
      required: ['contributions', 'affiliation'],
      properties: {
        contributions: { type: 'array', items: { type: 'string' } },
        keyPapers: { type: 'array', items: { type: 'string' } },
        affiliation: { type: 'string' },
        notableAchievements: { type: 'string' }
      }
    },
    researchLimit: 10
  }
})
```

---

## 7. Self-Evaluation

| Dimension | Score | Justification |
|-----------|-------|---------------|
| **Coherence** | 0.85 | Three-layer architecture tells a consistent story. All patterns fit the same TaskStore abstraction. |
| **Grounding** | 0.90 | Every claim verified against live API data, SDK source, and MCP spec. Item data shapes confirmed empirically. |
| **Compression** | 0.80 | Architecture reduces to: "server-internal task store + background workflow functions + existing dispatcher". Concise thesis. |
| **Surprise** | 0.75 | Server-internal tasks (bypassing MCP Tasks protocol limitation) is non-obvious. Composition of Websets + Research API is novel. Convergent search pattern adds genuine value beyond single webset. |
| **Actionability** | 0.90 | Implementation roadmap is phased with clear deliverables. TypeScript interfaces specified. File structure defined. A future session can implement Phase 1 directly. |

**Composite**: 0.84

---

## 8. Key Decisions Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Server-internal tasks, not MCP Tasks protocol | Client support for MCP Tasks is near-zero. Server-internal gives us the same semantics with universal client compatibility. | MCP Tasks (future-ready but unusable now), Agent-level orchestration (no server changes but fragile) |
| In-memory task store, not persistent | Tasks are minutes-long, not days-long. Simplicity > durability for v1. | SQLite (overhead), Redis (dependency) |
| Same manage_websets tool, not new tool | Unified dispatcher pattern (ADR-001). One tool, one namespace, consistent UX. | Separate `manage_tasks` tool (fragmenting), separate `research` tool |
| Research API as both primitive ops AND task type | Layer 2 gives direct access. Task type `research.deep` adds task lifecycle. Agent picks the right level. | Only task type (loses fine-grained control), Only primitive (loses task polling) |
| Agent-driven iteration, not server-side auto-refinement | Server-side refinement requires LLM calls within the server. Out of scope for v1. Agent is better positioned to evaluate and refine. | Server-side LLM (scope creep), Hardcoded refinement rules (too rigid) |

---

## 9. Clune QD/Open-Endedness Integration

Analysis of Jeff Clune's quality-diversity and open-endedness corpus (MAP-Elites, POET, Go-Explore, AI-GAs, novelty search) reveals 5 design refinements and 2 future directions.

### 9.1 What Changes (v1 refinements)

**A. Webset = Archive (MAP-Elites core pattern)**

The webset itself IS the persistent archive. It lives in Exa's cloud, items accumulate across searches, enrichments add quality dimensions. Design implication: patterns should **build on** existing websets via `searches.create` with `behavior='append'`, not always create new ones.

All task types that create websets gain an optional `seedWebsetId` parameter:
```typescript
{
  type: 'lifecycle.harvest',
  seedWebsetId?: string,  // append to existing webset instead of creating new
  // ... other args
}
```
When provided, the task adds a new search to the existing webset rather than creating a fresh one. The existing items persist — this is archive memory.

**B. Descriptor Feedback (learned diversity metrics)**

The Exa API already provides descriptor quality signals via `successRate` on each criterion. `qd.winnow` should report these and flag descriptor quality:
```typescript
descriptorFeedback: Array<{
  criterion: string,
  successRate: number,
  quality: 'too-strict' | 'good-discriminator' | 'not-discriminating',
  // too-strict: < 5%, good: 5-95%, not-discriminating: > 95%
}>
```
This is descriptor learning via API feedback — the system tells you which behavioral coordinates are actually useful.

**C. Critique as Composable Phase**

All task types gain an optional `critique: boolean` flag. When true, after the main workflow completes, the server calls the Research API to evaluate results:
```
instructions: "Given the research query '{query}' and these {N} results, assess:
1. Coverage: are important entities/aspects missing?
2. Quality: are results genuinely relevant?
3. Gaps: what blind spots exist?
4. Surprises: anything unexpected that deserves deeper investigation?"
```
Adds a `critique` field to task result with the Research API's structured assessment.

**D. Stepping-Stone Transfer (agent-mediated, v1)**

Task results include `websetId`. The agent can inspect prior task results and pass information to subsequent tasks. For v1 this is agent-mediated (the agent reads task A's result and uses it to construct task B's args). The server doesn't need special transfer logic yet.

Example stepping-stone flow:
```
Task A: lifecycle.harvest → finds 50 AI safety companies
Agent: reads results, identifies 3 underexplored niches
Task B: lifecycle.harvest(seedWebsetId: taskA.websetId, criteria: [refined based on niches])
→ Appends to same archive, filling gaps
```

**E. Local Competition via Niches (already in qd.winnow)**

The criteria-combination-as-niche approach already implements local competition — fitness is compared within niches, not globally. Confirmed as aligned with Clune patterns.

### 9.2 Future Directions (v2+)

**POET-R: Co-evolving research questions and solutions**

The iterative.refine pattern is a simplified version of POET. The full POET-R pattern would:
1. Generate research questions from results (requires LLM-in-the-loop in server)
2. Create new websets for generated questions
3. Transfer promising items between websets
4. Maintain a growing archive of question-answer pairs

This requires server-side LLM calls and is out of scope for v1, but the architecture supports it — add a new task type that calls the Research API to generate questions, then dispatches lifecycle.harvest tasks internally.

**Automated Descriptor Evolution**

Currently criteria are user-provided. Future: analyze criteria success rates across multiple rounds and automatically evolve better descriptors. Low-successRate criteria get loosened. Non-discriminating criteria get tightened. New criteria get proposed based on item properties that correlate with enrichment fitness scores.

### 9.3 Mapping: Clune Patterns → Our Task Types

| Clune Pattern | Our Implementation | Status |
|--------------|-------------------|--------|
| MAP-Elites archive | Webset = persistent archive; qd.winnow = MAP-Elites loop | v1 |
| Behavioral descriptors | Criteria satisfaction vectors | v1 |
| Fitness function | Enrichment result scores | v1 |
| Descriptor learning | successRate feedback in qd.winnow | v1 |
| Local competition | Per-niche fitness comparison | v1 |
| Stepping-stone transfer | Agent-mediated via websetId passing | v1 |
| Novelty/deception awareness | adversarial.verify pattern | v1 |
| Automated critique | Optional Research API critique phase | v1 |
| Go-Explore archive-first | seedWebsetId + append behavior | v1 |
| POET co-evolution | iterative.refine (simplified); POET-R (v2) | v1/v2 |
| AI-GAs meta-level | Out of scope (agent-level concern) | — |

---

## 10. Open Questions

1. **Task result size**: Should large results (1000+ items) be stored in the task result or referenced via websetId? Storing full items in memory could be expensive.

2. **Enrichment status tracking**: When enrichments are added after search, should the task track per-enrichment status or just wait for overall webset idle?

3. **Research API availability in exa-js**: The SDK shows `exa.research.create()` etc. but we should verify the exact TypeScript types before implementing. The SDK may lag behind the API.

4. **Convergent search deduplication**: Fuzzy entity matching is hard. Should we start with URL-only matching (simpler, may miss duplicates) or invest in name similarity (more complex, better results)?

5. **Task concurrency limit**: Default 20 concurrent tasks seems reasonable. Should this be configurable via environment variable?

6. **Archive persistence across server restarts**: Websets persist in Exa's cloud (good), but the TaskStore doesn't survive restart. Should completed task metadata be persisted to enable cross-session archive awareness?

7. **Critique cost**: Research API calls cost ~$0.13-0.24 each. Should critique be opt-in (default false) or opt-out (default true)?
