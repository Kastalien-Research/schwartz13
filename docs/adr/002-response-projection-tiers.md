# ADR-002: Response Projection Tiers for Agent Context

## Status

Accepted

## Context

Every handler currently passes raw Exa API responses to the agent via `successResult(JSON.stringify(data))`. A fully-enriched WebsetItem with content can be 5–55 KB. Agents consuming this repeatedly waste context on:

1. **Items that don't pass criteria** — noise the Websets filter was supposed to remove
2. **Fields irrelevant to decisions** — content (1–200 KB), reasoning chains, references, timestamps, configuration details
3. **Structural overhead** — nested polymorphic objects the agent has to parse to extract basic facts

The projection layer completes the filtering by only surfacing what survived and presenting it flat.

## Decision

### 1. All-Domain Projection Layer

Add `src/lib/projections.ts` with one projection function per domain. Each extracts status + primary useful fields, drops timestamps/configuration/nested overhead. Entity type promoted from `properties.type` to a top-level field on items, and from `searches[0].entity.type` on websets.

### 2. Item Filtering

Bulk item responses (`items.list`, `items.getAll`, workflow results) exclude items where no `evaluation.satisfied === "yes"`. Items with no evaluations pass through (no criteria = no filtering).

### 3. Single-Item Inspection Unchanged

`items.get` returns full raw response — single-item inspection should have all details.

## Projected Fields by Domain

See `src/lib/projections.ts` for exact shapes. Summary:

| Domain | Key Fields Kept | Key Fields Stripped |
|--------|----------------|-------------------|
| Item (bulk) | id, name, url, entityType, description, evaluations[criterion+satisfied], enrichments[description+format+result] | properties.content, evaluation reasoning/references, enrichment reasoning/references/enrichmentId/status, entity sub-objects, timestamps |
| Webset | id, status, title, entityType, metadata, searches[id+status+query+progress], enrichments[id+status+description+format], monitors[id+status+nextRunAt], imports[id+status+count] | Full search/enrichment/monitor/import objects, configuration |
| Search | id, status, query, metadata, progress[found+analyzed+completion+timeLeft], criteria[description+successRate] | Entity config, behavior, timestamps |
| Enrichment | id, status, description, format, metadata | Options config, timestamps |
| Monitor | id, status, nextRunAt, metadata, lastRun[status+completedAt] | Cadence config, behavior config |
| Monitor Run | id, status, type, completedAt, failedReason | Timing details |
| Webhook | id, status, url, events, metadata | Secret, timestamps |
| Webhook Attempt | eventType, successful, responseStatusCode, attemptedAt | Full payload, headers |
| Import | id, status, count, title, metadata, failedReason | File details, timestamps |
| Event | id, type, createdAt | Data payload (agent should use specific get operations) |
| Research | researchId, status, model, output (completed), cost (completed) | Events, intermediate steps |

## Consequences

- Projected item ~200–500 bytes vs 5–55 KB raw → 10–100× context reduction
- Items failing all criteria excluded from bulk responses → cleaner agent decisions
- `entityType` promoted to top level → no more parsing `properties.type`
- Single-item get (`items.get`) unchanged → full inspection still available
- Workflow internals still use full raw items for classification/scoring
