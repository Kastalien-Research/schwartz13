# Exa Data Flow Research

**Status**: Complete
**Date**: 2026-02-08
**Sources**: Exa SDK types (`exa-js/dist/index.d.ts`), API documentation (docs.exa.ai), integration test observations, handler/workflow source code

---

## 1. Websets Data Lifecycle

### 1.1 State Machines

#### Webset Status
```
                 ┌──────────┐
    create ──────► pending  │
                 └────┬─────┘
                      │ search starts / enrichments queue
                      ▼
                 ┌──────────┐
                 │ running  │◄──── monitor run triggers / new search
                 └────┬─────┘
                      │ all searches + enrichments complete
                      ▼
                 ┌──────────┐
                 │  idle    │◄──── steady state (data available)
                 └────┬─────┘
                      │ user action
                      ▼
                 ┌──────────┐
                 │ paused   │
                 └──────────┘
```

**Key observations**:
- Webset status is a *composite* — it reflects the aggregate state of all sub-resources (searches, enrichments, monitors)
- A webset transitions to `idle` only when ALL running operations complete
- New operations (adding a search, creating an enrichment) push the webset back to `running`
- There is no `completed` or `deleted` status on the Webset itself — deletion is a destructive operation that removes the resource entirely

#### WebsetSearch Status
```
created → pending → running → completed
                           └→ canceled (reason: webset_deleted | webset_canceled)
```

**Progress tracking** (available during `running`):
```typescript
progress: {
  found: number,       // items found matching criteria so far
  analyzed: number,    // total URLs analyzed
  completion: number,  // 0-100 percentage
  timeLeft: number | null  // estimated seconds remaining
}
```

**Recall estimation** (available after completion):
```typescript
recall: {
  expected: {
    total: number,     // estimated total matching entities on the web
    bounds: { min: number, max: number },
    confidence: "high" | "medium" | "low"
  },
  reasoning: string    // explanation of the estimate
} | null
```

**Criteria tracking** (live during search):
```typescript
criteria: Array<{
  description: string,
  successRate: number  // 0-100, percentage of analyzed items satisfying this criterion
}>
```

#### WebsetEnrichment Status
```
pending → completed
       └→ canceled
```

Enrichment status is at the *definition* level. Individual items have their own enrichment results:
```
EnrichmentResult.status: pending → completed
                                └→ canceled
```

#### Import Status
```
pending → processing → completed
                    └→ failed (reason: invalid_format | invalid_file_content | missing_identifier)
```

#### Monitor Status
```
enabled ←→ disabled
```

Monitor is a configuration resource, not a one-shot operation. It produces MonitorRuns:
```
MonitorRun.status: created → running → completed
                                    └→ canceled
                                    └→ failed
```

#### Research API Status
```
pending → running → completed (with output + costDollars)
                 └→ canceled
                 └→ failed
```

### 1.2 Search Pipeline: When Items Appear

**Timeline for a typical search**:

1. **T+0s**: `searches.create` returns immediately with status `created`
2. **T+<1s**: Status transitions to `pending`, then `running`
3. **T+5-30s**: First items begin appearing. `progress.found` starts incrementing.
4. **T+30s-10min** (25 items): Search completes for small counts. `progress.completion` reaches 100.
5. **T+~1hr** (1000+ items): Large searches take significantly longer due to Exa's web crawling pipeline.

**Empirical observations from integration tests**:
- Small searches (10-25 items) complete in 5-30 seconds
- `progress.timeLeft` is `null` initially, then populates as the search calibrates
- Items are available for listing *before* the search completes (streaming behavior)
- The webset remains in `running` state until the search completes AND all enrichments finish
- `searches.create` requires the `behavior` field (`"append"` | `"override"`) — not optional despite what SDK types may suggest

### 1.3 Enrichment Pipeline

**Execution model**: Enrichments run in parallel across items, not sequentially.

```
Search starts
  └─► Items begin appearing
       └─► As each item is found:
            ├─► Criteria evaluations run (populate item.evaluations[])
            └─► Enrichment tasks queue (each enrichment definition × each item)
                 └─► Each enrichment result populates independently
                      └─► When ALL enrichment results for ALL items complete:
                           └─► Webset transitions to idle
```

**Key behaviors**:
- Enrichments begin processing items as they're found — they don't wait for the search to complete
- Each `WebsetItem.enrichments[]` entry has its own `status` (`pending` → `completed` | `canceled`)
- The `result` field is always `string[] | null`, even for `number` format enrichments — the server returns stringified values
- There is no `boolean` enrichment format — the available formats are: `text`, `date`, `number`, `options`, `email`, `phone`, `url`
- `enrichments.update` returns `void` (not the enrichment object) — verified empirically

**Enrichment result shape**:
```typescript
{
  enrichmentId: string,
  format: "text" | "date" | "number" | "options" | "email" | "phone" | "url",
  result: string[] | null,
  status: "pending" | "completed" | "canceled",
  reasoning: string | null,
  references: Array<{ url: string, title: string | null, snippet: string | null }>,
  object: "enrichment_result"
}
```

### 1.4 Item Data Shape at Each Stage

#### Stage 1: Just Found (search in progress, no enrichments yet)

```typescript
{
  id: "wi_abc123",
  object: "webset_item",
  websetId: "ws_xyz",
  source: "search",
  sourceId: "wss_def",
  createdAt: "2026-02-08T...",
  updatedAt: "2026-02-08T...",
  properties: {
    type: "company",
    url: "https://example.com",
    description: "Short description of relevance",
    company: {
      name: "Example Corp",
      about: "A short description...",
      industry: "Technology",
      location: "San Francisco, CA",
      employees: 250,
      logoUrl: "https://..."
    },
    content: "Full text content of the company website..."  // ← THIS IS THE BIG ONE
  },
  evaluations: [
    {
      criterion: "Must be a B2B SaaS company",
      satisfied: "yes",
      reasoning: "The company provides cloud-based software...",
      references: [{ url: "...", title: "...", snippet: "..." }]
    }
  ],
  enrichments: null  // no enrichments defined yet
}
```

#### Stage 2: Enrichments Pending

```typescript
{
  // ...same as above, but:
  enrichments: [
    {
      enrichmentId: "we_ghi",
      format: "number",
      result: null,       // ← not yet computed
      status: "pending",
      reasoning: null,
      references: [],
      object: "enrichment_result"
    }
  ]
}
```

#### Stage 3: Fully Enriched

```typescript
{
  // ...same as above, but:
  enrichments: [
    {
      enrichmentId: "we_ghi",
      format: "number",
      result: ["50000000"],  // ← always string[], even for numbers
      status: "completed",
      reasoning: "Based on their Series C funding...",
      references: [{ url: "...", title: "...", snippet: "..." }],
      object: "enrichment_result"
    },
    {
      enrichmentId: "we_jkl",
      format: "text",
      result: ["Their primary product is..."],
      status: "completed",
      reasoning: "From their product page...",
      references: [{ url: "...", title: "...", snippet: "..." }],
      object: "enrichment_result"
    }
  ]
}
```

### 1.5 Monitor Behavior

Monitors are cron-scheduled recurring searches that append new items to an existing webset.

```
Monitor (enabled, cron: "0 9 * * 1") ──── every Monday 9am UTC
  └─► MonitorRun (created → running → completed)
       └─► Creates a new WebsetSearch (behavior: append by default)
            └─► New items added to webset (existing items preserved)
            └─► Enrichments re-run on new items
```

**Key behaviors**:
- Monitor defaults to `append` behavior — items accumulate over time
- Monitor can optionally override search parameters (query, criteria, entity, count)
- If no config overrides, it reuses parameters from the last search
- `monitors.runs.list` returns an empty list (not an error) for non-existent monitor IDs
- Cron must be 5-field format; schedule must trigger at most once per day
- Monitors have `lastRun` (embedded MonitorRun) and `nextRunAt` (nullable datetime)

### 1.6 Data Volume Profiles

**Entity property sizes** (estimated JSON bytes per entity type):

| Entity Type | Core Properties | With `content` | Notes |
|-------------|----------------|----------------|-------|
| Company | ~300-500 bytes | ~2-50 KB | `content` = full website text |
| Person | ~200-400 bytes | N/A | No `content` field |
| Article | ~200-400 bytes | ~1-100 KB | `content` = full article text |
| Research Paper | ~200-400 bytes | ~5-200 KB | `content` = full paper text |
| Custom | ~100-300 bytes | ~1-50 KB | `content` = page text |

**Per-item overhead** (beyond properties):

| Component | Estimated Size | Notes |
|-----------|---------------|-------|
| Evaluation (1 criterion) | ~200-500 bytes | criterion + satisfied + reasoning + references |
| Enrichment result (1) | ~200-2000 bytes | format-dependent; text enrichments are larger |
| Item metadata | ~100-200 bytes | id, dates, source, websetId |

**Full item estimate**: A company item with 3 criteria evaluations and 3 enrichments:
- Without `content`: ~2-4 KB
- With `content`: ~5-55 KB
- Multiply by 50 items (one page): **100-200 KB without content, 250 KB-2.75 MB with content**

**Webset container size** (the Webset object itself, NOT items):
- Contains: enrichment definitions[], search definitions[], monitor definitions[], import definitions[]
- Typical size: ~2-10 KB (no items embedded in list responses; items are a separate endpoint)
- `GetWebsetResponse` CAN include embedded items via `?expand=items` query parameter

### 1.7 Pagination

All list endpoints use cursor-based pagination:
```typescript
{ data: T[], hasMore: boolean, nextCursor: string | null }
```

| Endpoint | Max per page |
|----------|-------------|
| Items list | 50 |
| All other lists | 200 |

---

## 2. Exa Search API Data Flow

The Search API is a separate, synchronous API from the Websets API. It provides direct web search without the persistent state management of Websets.

### 2.1 Endpoints

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/search` | Keyword + neural search | POST |
| `/findSimilar` | Find pages similar to a URL | POST |
| `/contents` | Get full content for URLs | POST |
| `/answer` | AI-generated answer with citations | POST |

### 2.2 Request/Response Cycle

**Search** (`/search`):
- Request: `{ query, numResults?, type?, category?, includeDomains?, excludeDomains?, startPublishedDate?, endPublishedDate?, contents? }`
- Response: `{ results: Array<{ url, title, score, publishedDate, author, id, text?, highlights? }>, autopromptString? }`
- Latency: ~200-500ms for small result sets
- `type`: `"keyword"` (BM25), `"neural"` (embeddings), `"auto"` (default, hybrid)

**Contents** (`/contents`):
- Request: `{ ids: string[], text?: boolean | TextContentsOptions, highlights?: boolean | HighlightsContentsOptions, summary?: boolean | SummaryContentsOptions }`
- Response: Same shape as search results but with populated content fields
- Content options allow controlling: max characters, include HTML tags, highlights count, summary length

**Answer** (`/answer`):
- Request: Similar to search + `{ text: true }` (content required for answer generation)
- Response: Includes `answer` field (AI-generated text) plus source results

### 2.3 Data Freshness

- Exa maintains a continuously updated web index
- `publishedDate` reflects when Exa detected the page was published (may differ from actual publication)
- Content extraction happens at crawl time, not request time
- Date filtering available: `startPublishedDate`, `endPublishedDate`, `startCrawlDate`, `endCrawlDate`

### 2.4 Content Extraction

The Search API content extraction options:
```typescript
text: {
  maxCharacters?: number,    // limit text length
  includeHtmlTags?: boolean  // preserve HTML structure
}
highlights: {
  numSentences?: number,     // sentences per highlight
  highlightsPerUrl?: number, // highlights per result
  query?: string             // custom highlight query
}
summary: {
  query?: string             // custom summary query
}
```

### 2.5 Rate Limits and Pricing

| Endpoint | Rate Limit | Price |
|----------|-----------|-------|
| `/search` | 5 QPS | $5 per 1,000 requests |
| `/contents` | 50 QPS | $1 per 1,000 pages |
| `/findSimilar` | 5 QPS | $5 per 1,000 requests |
| `/answer` | 5 QPS | Search price + contents price |

---

## 3. Research API Data Flow

### 3.1 Request Lifecycle

```
research.create(instructions, model)
  │
  ▼
┌─────────┐     ┌──────────┐     ┌────────────┐
│ pending  │────►│ running  │────►│ completed  │
└─────────┘     └────┬─────┘     └──────┬─────┘
                     │                   │
                     ▼                   ▼
                ┌──────────┐      costDollars: {
                │ canceled │        numSearches,
                └──────────┘        numPages,
                     │              reasoningTokens,
                     ▼              total
                ┌──────────┐      }
                │  failed  │      output: {
                └──────────┘        content: string,
                                    parsed?: object
                                  }
```

### 3.2 Event Hierarchy (during `running`)

Research tasks emit structured events that reveal the execution pipeline:

```
plan-definition     → High-level research plan
  └─► plan-operation  → Executing a plan step
       └─► plan-output  → Plan step result
            └─► task-definition  → Specific research sub-task
                 └─► task-operation  → Executing the sub-task
                      └─► task-output  → Sub-task result
```

Events are available via:
- Polling: `research.get(id)` with `?events=true` query parameter
- Streaming: SDK supports SSE via `stream: true` parameter

### 3.3 Models

| Model | Speed | Cost | Use Case |
|-------|-------|------|----------|
| `exa-research-fast` | Fastest | Cheapest | Quick lookups, simple questions |
| `exa-research` | Balanced | Medium | Default, general research |
| `exa-research-pro` | Slowest | Highest | Complex analysis, thorough reports |

### 3.4 Structured Output

Research supports JSON Schema enforcement:
```typescript
research.create({
  instructions: "Find the top 10 AI companies...",
  model: "exa-research",
  outputSchema: {
    type: "object",
    properties: {
      companies: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, ... } }
      }
    }
  }
})
```

When `outputSchema` is provided:
- `output.content` contains the JSON as a string
- `output.parsed` contains the validated JSON object

### 3.5 Cost Breakdown

Completed research includes detailed billing:
```typescript
costDollars: {
  numSearches: number,        // search queries performed
  numPages: number,           // web pages crawled
  reasoningTokens: number,    // AI tokens used
  total: number               // USD total
}
```

Pricing: $5/1k searches + $5/1k pages + $5/1M reasoning tokens

### 3.6 Concurrency

- Maximum 15 concurrent research tasks per API key
- SDK provides `pollUntilFinished()` helper for async polling

---

## 4. Cross-Cutting Concerns

### 4.1 Rate Limits

| API | Endpoint/Resource | Limit |
|-----|-------------------|-------|
| Search API | `/search`, `/findSimilar` | 5 QPS |
| Search API | `/contents` | 50 QPS |
| Research API | Concurrent tasks | 15 |
| Websets API | Not documented | Observed ~5 QPS before throttling |

**Integration test implication**: `fileParallelism: false` in vitest config + 30s hook timeout to avoid hitting rate limits during test runs.

### 4.2 Error Patterns

| Error | Cause | Server Handling |
|-------|-------|-----------------|
| 400 | Invalid parameters (bad criteria format, missing required fields) | Handler-level validation with "Common issues" hints for searches |
| 401 | Invalid/missing API key | Passed through |
| 404 | Resource not found | Passed through |
| 429 | Rate limit exceeded | No automatic retry in handlers |
| 5xx | Exa infrastructure errors | No automatic retry in handlers |

**Search-specific error hints** (added by our server):
```
"Common issues: Ensure criteria is [{description: '...'}], entity is {type: '...'}, and behavior is 'append' or 'override'"
```

### 4.3 Data Consistency Model

- **Websets API**: Eventually consistent for item counts and search progress. Items may appear before `progress.found` increments. The `idle` status is the consistent "all work done" signal.
- **Search API**: Strongly consistent — synchronous request/response.
- **Research API**: Eventually consistent — polling required. Events accumulate during execution.

### 4.4 Webhook Event System

19 event types for real-time notifications:

```
webset.created        webset.deleted
webset.paused         webset.idle
webset.search.created webset.search.canceled
webset.search.completed webset.search.updated
import.created        import.completed
webset.item.created   webset.item.enriched
monitor.created       monitor.updated       monitor.deleted
monitor.run.created   monitor.run.completed
webset.export.created webset.export.completed
```

Each event carries:
```typescript
{ id: string, type: EventType, createdAt: string, data: <typed payload>, object: "event" }
```

The `data` field is polymorphic — its type depends on the event type (Webset, WebsetSearch, Import, Monitor, MonitorRun, WebsetItem, etc.).

### 4.5 Caching Characteristics

| Data | Cache-friendly? | Why |
|------|-----------------|-----|
| Webset metadata | Moderate | Changes on status transitions, but stable when idle |
| Item list | Poor during search | Items streaming in; good once webset is idle |
| Individual items | Good once enriched | Immutable after all enrichments complete |
| Search progress | Poor | Changes continuously during search |
| Enrichment definitions | Good | Rarely change after creation |
| Monitor config | Good | Only changes on explicit update |
| Events list | Append-only | New events added, old ones never change |

---

## 5. Data Volume Analysis: What Should Reach the Agent?

### 5.1 The Problem

A fully-enriched `WebsetItem` object with content can be 5-55 KB of JSON. A single page of 50 items could be 250 KB - 2.75 MB. An agent iterating over items repeatedly (e.g., for QD winnowing, convergent search, or lifecycle harvest) would consume enormous context window space.

**The entire Webset object, or even most of a WebsetItem, should almost never go directly to the agent.**

### 5.2 What's Small Enough for Repeated Consumption

These are the data shapes that an agent can reasonably take in per iteration without excessive context cost:

#### Tier 1: Always Safe (~100-300 bytes per item)
```typescript
// Identity + verdict
{
  id: string,                           // "wi_abc123"
  url: string,                          // from properties
  name: string,                         // from properties (entity-specific)
  description: string,                  // from properties (~50-200 chars)
  evaluations: Array<{
    criterion: string,                  // short description
    satisfied: "yes" | "no" | "unclear" // the verdict
  }>
}
```

This is the "business card" of an item — who is it, where is it, does it pass the criteria? An agent can scan 50 of these in ~5-15 KB.

#### Tier 2: Safe for Targeted Use (~500-2000 bytes per item)
```typescript
// Identity + verdicts + enrichment results (no reasoning/references)
{
  id: string,
  url: string,
  name: string,
  description: string,
  evaluations: Array<{ criterion: string, satisfied: string }>,
  enrichments: Array<{
    description: string,    // what was asked
    format: string,
    result: string[] | null // the answer
  }>
}
```

This adds the enrichment answers without the reasoning chains or references. An agent can work with 50 of these in ~25-100 KB.

#### Tier 3: On-Demand, One at a Time (~2-50 KB per item)
```typescript
// Full item with content, reasoning, references
// Only fetch for items the agent has decided to inspect
```

The full `properties.content` field (website text, article body, paper text) plus enrichment `reasoning` and `references` should only be retrieved for specific items the agent is actively analyzing — never in bulk.

### 5.3 What This Means for the Server

The current handlers return raw Exa API responses. For agent-facing use, the server should consider:

1. **Summary projections**: A `items.listSummary` or projection parameter that returns Tier 1/Tier 2 shapes
2. **Content-on-demand**: Never include `properties.content` by default in list responses
3. **Workflow results**: The workflow layer (lifecycle.harvest, qd.winnow, etc.) should return Tier 2 summaries in task results, not full item objects
4. **Pagination awareness**: Even with Tier 1 projections, 1000 items = ~150-300 KB. The agent should work in pages, not try to ingest all items at once

### 5.4 Specifically for Workflow Results

Current workflow result includes `items: Array<WebsetItem>`. This should be changed to return:

```typescript
{
  items: Array<{
    id: string,
    url: string,
    name: string,            // extracted from entity-specific properties
    description: string,
    satisfied: string[],     // criteria descriptions where satisfied === "yes"
    enrichmentResults: Record<string, string[]>  // description → result
  }>,
  // Full items available via items.get(id) if the agent needs deep inspection
  websetId: string  // so the agent can fetch individual items on demand
}
```

---

## 6. Verification Answers

> **"I created a webset with 25 items and 3 enrichments — what happens on Exa's side, in what order, and how long does each stage take?"**

1. `websets.create(search: {query, entity, criteria, count: 25})` — webset created, status: `pending` → `running` (instant)
2. Search begins crawling the web — items start appearing after 5-30 seconds
3. As each item is found, criteria evaluations run (evaluations[] populated). Items begin appearing in `items.list`.
4. Enrichment tasks queue for each found item (3 enrichments × each item). Enrichments run in parallel across items.
5. Search completes (typically 30s-5min for 25 items). `progress.completion` = 100.
6. Enrichment results populate on each item (enrichments[].status → completed).
7. When ALL enrichment results for ALL items complete, webset status transitions to `idle`.
8. **Total time**: 1-10 minutes depending on query complexity and enrichment difficulty.

> **"If an agent calls items.list 30 seconds after creating a webset, what will it see?"**

Likely 5-15 items (depending on query difficulty), each with populated `evaluations[]` but `enrichments` either `null` or containing entries with `status: "pending"`. The search `progress.completion` would be 20-60%.

> **"What's the typical JSON size of a fully-enriched item object?"**

- Company (without content): ~2-4 KB
- Company (with content): ~5-55 KB
- The `content` field dominates — it's the full text of the entity's website/article/paper

> **"How many concurrent API calls can we make before hitting rate limits?"**

- Search API: 5 requests/second for search endpoints, 50/second for contents
- Research API: 15 concurrent tasks
- Websets API: Not officially documented, but integration tests use `fileParallelism: false` and 30s timeouts to avoid throttling. Empirically, rapid successive calls work but bursts of >5/s can trigger 429s.
