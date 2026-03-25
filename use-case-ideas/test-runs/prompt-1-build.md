# Prompt 1: Build the Design-Partner Radar Queueing Apparatus

<instructions>

You are building infrastructure for a design-partner radar system on an existing MCP server (schwartz13). The server already has webhook reception, a channel bridge, a SQLite store, and Exa API integrations. Your job is to add the domain-specific layers: company dedup, scoring, promotion logic, and a 3-webset configuration.

Read the spec at `use-case-ideas/test-runs/chatgpt-test-a.md` before starting. That document is the authoritative source for scoring rules, promotion logic, and the 3-webset definitions.

Read `CLAUDE.md` for architecture orientation. Read `src/store/db.ts` and `src/store/operations.ts` to understand the existing SQLite schema and operation patterns. Read `src/webhooks/eventBus.ts` to understand how webhook events flow. Read `src/channel.ts` to understand how channel notifications are formatted.

Implement the following changes. Build, test, and commit when done.

</instructions>

<context>

## Existing Infrastructure

The server runs on port 7860 (Docker). These components are already built and working:

### Webhook Receiver (`src/webhooks/receiver.ts`)
- `POST /webhooks/exa` — receives Exa webhook events, verifies `Exa-Signature` HMAC
- `GET /webhooks/events` — SSE stream for channel bridges
- Events are published via `webhookEventBus.publish(event)` in `src/webhooks/eventBus.ts`

### Event Bus (`src/webhooks/eventBus.ts`)
- On publish: writes to SQLite `events` table, upserts into `items` table (for item events), broadcasts to SSE subscribers
- Exports `webhookEventBus` singleton and `createEvent(payload)` factory

### SQLite Store (`src/store/db.ts`)
Existing tables: `items`, `annotations`, `events`, `snapshots`
Existing functions: `getDb()`, `upsertItem()`, `annotateItem()`, `getItemWithAnnotations()`, `getUninvestigatedItems()`, `insertEvent()`, `insertSnapshot()`, `getLatestSnapshot()`, `closeDb()`

### Store Operations (`src/store/operations.ts`)
Registered in `src/tools/operations.ts`: `store.annotate`, `store.getItem`, `store.listUninvestigated`, `store.query`

### Channel Bridge (`src/channel.ts`)
Stdio MCP server. Subscribes to `/webhooks/events` SSE stream. Pushes `notifications/claude/channel` into Claude Code with meta tags `event_type`, `webset_id`, `entity_name`, `event_id`.

### Operations Registry (`src/tools/operations.ts`)
70+ operations including all `exa.*`, `websets.*`, `webhooks.*`, `store.*`. New operations follow the pattern in `src/store/operations.ts`: export a handler function and a Zod schema, then register both in `OPERATIONS` and `OPERATION_SCHEMAS`.

### Workflow Registry
`src/workflows/types.ts` exports `registerWorkflow(type, fn)`. New workflows are imported in `src/workflows/index.ts` as side effects. The semantic cron workflow in `src/workflows/semanticCron.ts` already supports `webhookUrl` for auto-registering Exa webhooks.

</context>

<tasks>

## Task 1: Add Queue Schema to SQLite

In `src/store/db.ts`, add these 4 tables to the `initSchema` function:

```sql
CREATE TABLE IF NOT EXISTS company_records (
  domain TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  sector TEXT,
  employee_count_signal TEXT,
  icp_fit INTEGER DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lens_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_domain TEXT NOT NULL REFERENCES company_records(domain),
  lens_id TEXT NOT NULL,
  webset_id TEXT,
  item_id TEXT,
  strength TEXT DEFAULT 'medium',
  evidence_url TEXT,
  evidence_summary TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_domain, lens_id)
);

CREATE TABLE IF NOT EXISTS scores (
  company_domain TEXT PRIMARY KEY REFERENCES company_records(domain),
  score INTEGER NOT NULL DEFAULT 0,
  components JSON,
  verdict TEXT DEFAULT 'monitor',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_domain TEXT NOT NULL REFERENCES company_records(domain),
  verdict TEXT NOT NULL,
  confidence REAL,
  payload JSON,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add indexes on `lens_hits(company_domain)` and `verdicts(company_domain)`.

Add these exported functions:

- `upsertCompany(domain, name, sector?, employeeSignal?)` — INSERT OR UPDATE on company_records, always update `last_seen`
- `recordLensHit(domain, lensId, opts?)` — INSERT OR UPDATE on lens_hits (opts: websetId, itemId, strength, evidenceUrl, evidenceSummary)
- `updateScore(domain, score, components, verdict)` — INSERT OR REPLACE on scores
- `saveVerdict(domain, verdict, confidence, payload)` — INSERT into verdicts
- `getCompany(domain)` — returns company_records row + lens_hits + latest score + latest verdict
- `listCandidates(minScore?, verdict?)` — returns companies matching criteria, ordered by score DESC
- `normalizeDomain(url)` — extract root domain from URL, lowercase, strip www

## Task 2: Add Store Operations

In `src/store/operations.ts`, add handlers and Zod schemas for:

- `store.upsertCompany` — `{ domain, name, sector?, employeeSignal? }`
- `store.recordLensHit` — `{ domain, lensId, websetId?, itemId?, strength?, evidenceUrl?, evidenceSummary? }`
- `store.updateScore` — `{ domain, score, components, verdict }`
- `store.saveVerdict` — `{ domain, verdict, confidence?, payload? }`
- `store.getCompany` — `{ domain }`
- `store.listCandidates` — `{ minScore?, verdict? }`

Register all in `src/tools/operations.ts` in both `OPERATIONS` and `OPERATION_SCHEMAS`.

## Task 3: Build Receiver Rules

Create `src/webhooks/receiverRules.ts`. This module is called by `eventBus.ts` during `publish()` for `webset.item.created` and `webset.item.enriched` events. It:

1. Extracts company name and URL from the webhook payload (same entity extraction as eventBus.ts already does)
2. Calls `normalizeDomain(url)` to get root domain
3. Calls `upsertCompany(domain, name)` to dedup
4. Determines which lens fired based on the `websetId` (requires a mapping from websetId → lensId, stored in a config or lookup table)
5. Calls `recordLensHit(domain, lensId, ...)` with evidence from enrichments
6. Calls `computeScore(domain)` to recompute the company's score
7. If the score crosses a threshold (>= 7), emits a compact channel-ready event

Export a function: `processWebhookItem(event: WebhookEvent, websetLensMap: Map<string, string>): CompactCandidate | null`

The `CompactCandidate` type:
```typescript
interface CompactCandidate {
  action: 'claim_and_research' | 'queue_for_review' | 'monitor';
  company: string;
  companyDomain: string;
  lensHits: string[];
  score: number;
  primaryUrl: string;
  summary: string;
}
```

## Task 4: Implement Scoring

In `src/webhooks/receiverRules.ts`, implement `computeScore(domain)`:

Read the company's lens_hits from SQLite and compute:
- +5 if lens `control_pain` has a hit
- +4 if company appears in 2+ lenses
- +3 if lens `trigger_event` has a hit AND evidence is within 30 days
- +3 if evidence comes from docs / changelog / engineering post (check evidence_url patterns)
- +2 if enrichments mention a buyer role (check enrichment values)
- +2 if employee count signal suggests 20-3000
- -4 if sector matches agency/consultancy
- -3 if sector matches consumer-only
- -3 if evidence is generic AI PR (check enrichment values)
- -2 if evidence is older than 90 days

Verdicts based on score:
- >= 10 → `claim_and_research` (action: immediate)
- 7-9 → `queue_for_review`
- < 7 → `monitor`

Call `updateScore(domain, score, components, verdict)` to persist.

## Task 5: Wire Receiver Rules into Event Bus

In `src/webhooks/eventBus.ts`, after the existing item upsert logic, call `processWebhookItem()` for item events. If it returns a `CompactCandidate`, broadcast a second event with type `NEW_OPPORTUNITY_CANDIDATE` and the candidate as payload.

The channel bridge already forwards all events — the channel instructions (Task 6) will handle routing by event type.

## Task 6: Update Channel Instructions

In `src/channel.ts`, replace the existing `instructions` string with one that handles `NEW_OPPORTUNITY_CANDIDATE` events. The new instructions should:

- Recognize `NEW_OPPORTUNITY_CANDIDATE` in the channel event `event_type` meta field
- For `claim_and_research` action (score >= 10): immediately run the research workflow (to be defined in Prompt 2)
- For `queue_for_review` action (score 7-9): log to user, defer research
- For `monitor` action (score < 7): log only
- For raw `webset.item.created`/`webset.item.enriched` events: continue with the existing annotation behavior
- For `webset.idle` events: report that a webset finished populating

Keep the existing tool reference documentation (exa.search, store.annotate, etc.) in the instructions.

## Task 7: Create 3-Webset Config

Create `use-case-ideas/test-runs/design-partner-radar.json` with the exact 3 websets from the spec (sections 2.A, 2.B, 2.C). Use the semantic cron config format from `use-case-ideas/company-watchtower.json` as the structural template. Include:

- `name: "design-partner-radar"`
- 3 lenses with ids: `agent_buildout`, `control_pain`, `trigger_event`
- Each lens's `source` uses the search prompt, criteria, and enrichments from the spec exactly
- Shapes that pass items through if key enrichments are present
- Join by `entity` with `nameThreshold: 0.85` and `minLensOverlap: 2`
- Signal with `combination` type matching the spec's promotion logic
- `webhookUrl` set to `"{{webhookUrl}}"` (template variable)
- Monitor with weekly cron

## Task 8: Tests

Write tests in:

- `src/store/__tests__/queue.test.ts` — test `upsertCompany`, `recordLensHit`, `updateScore`, `getCompany`, `listCandidates`, `normalizeDomain`
- `src/webhooks/__tests__/receiverRules.test.ts` — test `processWebhookItem` with mock events, verify scoring logic, verify dedup behavior

Use the existing test patterns: vitest, `closeDb()` in afterEach, temp DB paths.

## Task 9: Build and Commit

1. Run `npm run build` — must compile cleanly
2. Run `npx vitest run src/store/__tests__/ src/webhooks/__tests__/` — all tests must pass
3. Run `npx vitest run` excluding integration tests — verify no regressions
4. Commit with message: `feat: design-partner radar queueing apparatus with scoring and dedup`
5. Push

</tasks>

<verification>

After completing all tasks, verify end-to-end by running this curl command to simulate a webhook and checking that a company record + lens hit + score are created in SQLite:

```bash
curl -X POST http://localhost:7860/webhooks/exa \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "evt_verification",
    "type": "webset.item.enriched",
    "data": {
      "id": "item_verify_1",
      "websetId": "ws_agent_buildout",
      "properties": {
        "type": "company",
        "url": "https://vercel.com",
        "company": { "name": "Vercel" }
      },
      "enrichments": [
        {"enrichmentId": "e1", "description": "short company description", "status": "completed", "result": ["Developer platform for frontend frameworks"]},
        {"enrichmentId": "e2", "description": "one-sentence summary of the AI/agent initiative", "status": "completed", "result": ["Launched v0 AI coding assistant and AI SDK for building agent workflows"]}
      ],
      "evaluations": [{"satisfied": "yes"}]
    }
  }'
```

Then verify via the execute tool:
```javascript
const company = await callOperation('store.getCompany', { domain: 'vercel.com' });
console.log(company);
// Should show: company record, lens hit for agent_buildout, computed score
```

</verification>
