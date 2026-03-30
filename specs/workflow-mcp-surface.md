# Spec: Workflows as MCP Resources + Prompts

**Status:** Draft
**Author:** Claude + user
**Date:** 2026-03-30
**Branch:** research-one

## Objective

Expose all promoted workflows as MCP resources (documentation) and prompts
(invocation guidance), giving each workflow first-class presence in the MCP
protocol alongside its existing execution path through Code Mode.

## Motivation

Today workflows are functions in a `Map<string, WorkflowFunction>`. The catalog
gives them thin stubs ("Background workflow: qd.winnow"). There is no
discoverable documentation, no invocation guidance, and no way for an MCP client
to browse what workflows exist or understand how to use them.

The principle: **when you promote a workflow into the codebase, the metadata is
part of the registration contract.** Documentation becomes a first-class
engineering artifact, not an afterthought.

## Design

### Three interaction modes per workflow

| Mode | MCP Primitive | Address | Returns |
|------|---------------|---------|---------|
| What is it? | Resource | `workflow://qd.winnow` | Markdown documentation |
| Help me use it | Prompt | `workflow/qd.winnow` | Invocation guidance + goal |
| Run it | Tool (execute) | `callOperation('tasks.create', ...)` | Execution result |

### Data model

```typescript
// src/workflows/types.ts

interface ParameterMeta {
  name: string;
  type: string;           // 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum'
  required: boolean;
  description: string;
  default?: unknown;
  constraints?: string;   // e.g. "2-5 items", "max 10"
}

interface WorkflowMeta {
  title: string;           // "Quality-Diversity Winnow"
  description: string;     // 1-2 sentence purpose statement
  category: string;        // retrieval | research | analysis | monitoring | verification | lifecycle
  parameters: ParameterMeta[];
  steps: string[];         // Ordered human-readable step descriptions
  output: string;          // Description of what the result contains
  example: string;         // Copy-pasteable callOperation() invocation
  relatedWorkflows?: string[];
  tags: string[];
}

// New export alongside workflowRegistry
export const workflowMetadata = new Map<string, WorkflowMeta>();
```

### Registration contract

`registerWorkflow` gains an optional third argument:

```typescript
export function registerWorkflow(
  type: string,
  fn: WorkflowFunction,
  meta?: WorkflowMeta,
): void {
  workflowRegistry.set(type, fn);
  if (meta) workflowMetadata.set(type, meta);
}
```

Workflows with metadata get resources + prompts. Workflows without (echo) are
left bare.

### MCP surface

**12 resources:**
- `workflow://qd.winnow` through `workflow://verify.enrichments` (11 per-workflow)
- `workflow://index` (categorized listing of all workflows)

**12 prompts:**
- `workflow/qd.winnow` through `workflow/verify.enrichments` (11 per-workflow, each with a single `goal` argument)
- `workflow/choose` (workflow selection guidance with `goal` argument)

**0 new tools** — Code Mode's 3-tool surface (search, execute, status) is unchanged.

### Rendering

Single function `renderWorkflowResource(key, meta)` produces Markdown:

```markdown
# {title} ({key})

{description}

**Category:** {category}

## Quick Start

```javascript
{example}
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ... | ... | ... | ... |

## How It Works

1. {step 1}
2. {step 2}
...

## Output

{output}

## Related Workflows

- **{related}** — {related description}
```

Quick Start is placed first because when embedded in a prompt, the LLM needs
the invocation pattern immediately.

### Prompt structure

Each per-workflow prompt takes a single `goal` argument and returns:

```typescript
{
  messages: [
    {
      role: 'user',
      content: {
        type: 'text',
        text: renderWorkflowResource(key, meta),  // full documentation
      },
    },
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Goal: ${goal}\n\nUsing the workflow documented above, construct the appropriate callOperation('tasks.create', { type: '${key}', args: {...} }) invocation for the execute tool. Fill in the parameters based on the goal.`,
      },
    },
  ],
}
```

The `workflow/choose` prompt embeds the index resource and adds a decision tree
mapping goal types to recommended workflows.

### Catalog integration

`catalog.ts` buildCatalog() updated: for workflows with metadata, use
`meta.description` as the summary and `meta.tags` as search tags instead of the
current thin stubs.

### Index resource content

`workflow://index` serves a categorized Markdown listing:

```markdown
# Websets Workflows

11 background workflows that orchestrate Exa Websets operations into
higher-level research and analysis patterns. Launch any workflow via
`callOperation('tasks.create', { type: '<type>', args: {...} })`.

## Retrieval
- **retrieval.searchAndRead** — Search and read page contents
- **retrieval.expandAndCollect** — Expand results via similarity search
- **retrieval.verifiedAnswer** — Get answers with citation validation

## Research
- **research.deep** — Open-ended research via Exa Research API
- **research.verifiedCollection** — Collect entities + per-entity deep research

## Analysis
- **qd.winnow** — Quality-diversity search with niche classification
- **convergent.search** — Multi-query triangulation
- **adversarial.verify** — Hypothesis testing with thesis/antithesis evidence

## Monitoring
- **semantic.cron** — Multi-lens signal monitoring with delta tracking

## Verification
- **verify.enrichments** — Per-field enrichment verification

## Lifecycle
- **lifecycle.harvest** — Create, poll, and collect from a webset
```

## Workflow metadata reference

Concrete metadata for each promoted workflow. These are the natural language
descriptions that will be served as resources and used in prompts.

### qd.winnow

- **Title:** Quality-Diversity Winnow
- **Category:** analysis
- **Description:** Search for entities matching criteria, classify them into
  quality-diversity niches based on criteria satisfaction patterns, score by
  enrichment quality, and select elite representatives. Inspired by MAP-Elites:
  instead of finding the single best result, find the best in each behavioral niche.
- **Key parameters:** query (string), entity (object), criteria (array, 1-10),
  enrichments (array), count (number, default 50), selectionStrategy
  (all-criteria|any-criteria|diverse, default diverse), critique (boolean),
  seedWebsetId (string), timeout (number)
- **Steps:** validate, create/append webset, poll until idle, collect items,
  classify into niches, score fitness, select elites, compute metrics, optional
  critique
- **Output:** websetId, nicheDistribution, elites (projected), qualityMetrics
  (coverage, avgFitness, diversity, stringency), descriptorFeedback
- **Related:** lifecycle.harvest, convergent.search, verify.enrichments

### convergent.search

- **Title:** Convergent Search
- **Category:** analysis
- **Description:** Find entities from multiple angles by running 2-5 different
  search queries in parallel, then identifying which entities appear across
  multiple queries. High confidence comes from convergent evidence.
- **Key parameters:** queries (array of 2-5 strings), entity (object), criteria
  (array), count (number, default 25), timeout (number)
- **Steps:** validate, create websets per query, poll all until idle, collect
  items, deduplicate by URL and fuzzy name matching, compute overlap matrix
- **Output:** intersection (entities found in 2+ queries with confidence
  scores), unique (entities found in only one query), overlapMatrix,
  totalUniqueEntities
- **Related:** qd.winnow, adversarial.verify

### adversarial.verify

- **Title:** Adversarial Verification
- **Category:** analysis
- **Description:** Test a hypothesis by gathering evidence for and against it in
  parallel. Creates two websets — one for supporting evidence (thesis), one for
  counter-evidence (antithesis). Optionally synthesizes a balanced assessment.
- **Key parameters:** thesis (string), thesisQuery (string), antithesisQuery
  (string), entity (object), enrichments (array), count (number, default 25),
  synthesize (boolean), timeout (number)
- **Steps:** validate, create thesis webset, create antithesis webset, poll
  both, collect items from both, optionally synthesize via Research API
- **Output:** thesis (websetId, items, counts), antithesis (websetId, items,
  counts), optional synthesis (researchId, content)
- **Related:** convergent.search, research.deep, retrieval.verifiedAnswer

### research.deep

- **Title:** Deep Research
- **Category:** research
- **Description:** Run open-ended research using the Exa Research API. Provide a
  natural language question and optionally a structured output schema. Good for
  questions that need synthesis across multiple sources.
- **Key parameters:** instructions (string), model (string, default
  exa-research), outputSchema (object), timeout (number)
- **Steps:** create research task, poll until finished
- **Output:** researchId, status, result, model, duration
- **Related:** research.verifiedCollection, adversarial.verify

### research.verifiedCollection

- **Title:** Verified Collection
- **Category:** research
- **Description:** Collect entities via webset search, then run per-entity deep
  research using the Exa Research API with template expansion. Build dossiers by
  combining structured collection with deep investigation.
- **Key parameters:** query (string), entity (object), researchPrompt (string
  template with {{name}}, {{url}}, {{description}}), criteria (array),
  enrichments (array), researchSchema (object), researchModel (string, default
  exa-research), researchLimit (number, default 10), count (number, default 25),
  timeout (number)
- **Steps:** validate, create webset, poll until idle, collect items, run
  per-entity research (concurrency: 3)
- **Output:** websetId, items with research results per entity, totalItems,
  researchedCount
- **Related:** research.deep, lifecycle.harvest

### lifecycle.harvest

- **Title:** Lifecycle Harvest
- **Category:** lifecycle
- **Description:** The foundational create-poll-collect webset lifecycle. Creates
  a webset with search criteria and enrichments, waits for completion, and
  returns all items. The pattern that more complex workflows build on.
- **Key parameters:** query (string), entity (object), criteria (array),
  enrichments (array), count (number, default 25), cleanup (boolean, delete
  webset after), timeout (number)
- **Steps:** validate, create webset, poll until idle, collect items, optional
  cleanup
- **Output:** websetId, items (projected), itemCount, searchProgress,
  enrichmentCount
- **Related:** qd.winnow, convergent.search, verify.enrichments

### retrieval.searchAndRead

- **Title:** Search and Read
- **Category:** retrieval
- **Description:** Search the web and read page contents in one step. Uses Exa's
  search API to find results, then fetches full text and highlights for each
  page. Good for quick fact-finding.
- **Key parameters:** query (string), numResults (number, default 5), type
  (string), category (string), includeDomains (array), excludeDomains (array),
  startCrawlDate/endCrawlDate (string), startPublishedDate/endPublishedDate
  (string)
- **Steps:** search, read contents for top results
- **Output:** query, results (title, url, score), contents (url, title, text
  excerpt, highlights)
- **Related:** retrieval.expandAndCollect, retrieval.verifiedAnswer

### retrieval.expandAndCollect

- **Title:** Expand and Collect
- **Category:** retrieval
- **Description:** Start with a search, then expand coverage by finding similar
  pages for the top results. Deduplicates by URL. Good for discovering content
  beyond what a single search query returns.
- **Key parameters:** query (string), numResults (number, default 5), expandTop
  (number, default 3), category (string), startPublishedDate/endPublishedDate
  (string)
- **Steps:** initial search, expand top results via findSimilar, deduplicate
- **Output:** query, initialCount, expandedCount, deduplicatedCount, results
  (with source tracking)
- **Related:** retrieval.searchAndRead

### retrieval.verifiedAnswer

- **Title:** Verified Answer
- **Category:** retrieval
- **Description:** Get an answer to a question with independent validation.
  First calls the Exa answer API for a cited response, then runs an independent
  search to check how many validation sources overlap with the original
  citations.
- **Key parameters:** query (string), numValidation (number, default 3), model
  (string), systemPrompt (string)
- **Steps:** get answer with citations, independent validation search, read
  validation sources, compute citation overlap
- **Output:** answer, citations, validationSources, overlapCount,
  citationCount, validationCount
- **Related:** retrieval.searchAndRead, adversarial.verify

### semantic.cron

- **Title:** Semantic Cron
- **Category:** monitoring
- **Description:** Multi-lens monitoring system. Creates parallel websets
  (lenses) to observe different facets, evaluates items against shape conditions
  on enrichment values, joins results across lenses by entity or temporal
  proximity, and fires a composite signal when conditions are met. Supports
  template variables, snapshot persistence to SQLite, delta computation against
  previous runs, and Exa webhook auto-registration.
- **Key parameters:** config (object — contains lenses[], shapes[], join,
  signal, optional monitor/webhook config), variables (object, template
  substitution), existingWebsets (object, for re-evaluation), timeout (number),
  previousSnapshot (object)
- **Config sub-structure:**
  - **lenses:** `[{ id, source: { query, entity, criteria, enrichments, count } }]`
  - **shapes:** `[{ lensId, conditions: [{ enrichment, operator, value }], logic: 'all'|'any' }]`
  - **join:** `{ by: 'entity'|'temporal'|'entity+temporal'|'cooccurrence', entityMatch?, temporal?, minLensOverlap? }`
  - **signal:** `{ requires: { type: 'all'|'any'|'threshold'|'combination', min?, sufficient? } }`
- **Steps:** validate + expand templates, create/fetch websets per lens, register
  webhooks, poll until idle, collect + resolve enrichments + evaluate shapes, join
  lens results, evaluate signal, build + persist snapshot, create monitors
- **Output:** websetIds, snapshot (lenses, join, signal), delta (if re-eval)
- **Related:** lifecycle.harvest, verify.enrichments

### verify.enrichments

- **Title:** Verify Enrichments
- **Category:** verification
- **Description:** Independently verify the enrichment data on a webset's items.
  Uses GitHub API for profile/repo verification, DNS MX checks for emails, and
  Exa search for general corroboration. Produces per-field verdicts (verified,
  unverified, contradicted, not_checkable) and persists results to SQLite.
- **Key parameters:** websetId (string), maxItems (number, default 50),
  concurrency (number, default 10), keywords (array, default ['mcp'])
- **Steps:** load webset metadata, collect items, verify each item (entity-type
  specific strategies), summarize
- **Output:** websetId, entityType, totalItems, averageVerificationScore,
  fieldStats, items with per-field verdicts
- **Related:** lifecycle.harvest, qd.winnow

## File changes

| File | Change | Est. lines |
|------|--------|------------|
| `src/workflows/types.ts` | Add WorkflowMeta, ParameterMeta, workflowMetadata Map, update registerWorkflow | ~50 |
| `src/workflows/mcp.ts` | **NEW** — renderWorkflowResource(), renderIndexResource(), registerWorkflowMcp() | ~120 |
| `src/workflows/qdWinnow.ts` | Add metadata to registerWorkflow | ~45 |
| `src/workflows/convergent.ts` | Add metadata | ~40 |
| `src/workflows/adversarial.ts` | Add metadata | ~40 |
| `src/workflows/researchDeep.ts` | Add metadata | ~30 |
| `src/workflows/verifiedCollection.ts` | Add metadata | ~40 |
| `src/workflows/lifecycle.ts` | Add metadata | ~35 |
| `src/workflows/searchAndRead.ts` | Add metadata | ~40 |
| `src/workflows/expandAndCollect.ts` | Add metadata | ~35 |
| `src/workflows/verifiedAnswer.ts` | Add metadata | ~35 |
| `src/workflows/semanticCron.ts` | Add metadata | ~55 |
| `src/workflows/verifyEnrichments.ts` | Add metadata | ~40 |
| `src/server.ts` | Import + call registerWorkflowMcp(server) | ~3 |
| `src/tools/catalog.ts` | Use workflowMetadata for better workflow entries | ~15 |
| `src/workflows/__tests__/mcp.test.ts` | **NEW** — rendering, registration, catalog tests | ~120 |

**Total:** ~740 lines

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Metadata optional in registerWorkflow | echo stays bare; real workflows get full treatment |
| 2 | TextContent in prompts (not EmbeddedResource) | Maximum client compatibility; trivial to upgrade later |
| 3 | Quick Start first in resource Markdown | LLM needs invocation pattern immediately when embedded in prompt |
| 4 | Single `goal` argument for all prompts | Simple, consistent; avoids duplicating parameter schema |
| 5 | Static resources only (no ResourceTemplate) | Full coverage with static registrations; template adds nothing |
| 6 | workflow/choose meta-prompt included | High-value decision support at negligible cost |
| 7 | No Zod schema generation in v1 | Deferred — catalog gets better text, schemas stay catch-all for now |

## Non-goals (future extensions)

- Zod schema generation from ParameterMeta (better catalog schemas)
- `workflow://{key}/status` resources for live task state
- Category-level prompts (workflow/retrieval, workflow/research, etc.)
- Composition pattern documentation (workflow chains)
- EmbeddedResource content type in prompt messages
- Resource subscriptions for state change notifications

## Testing

- **Unit:** renderWorkflowResource produces expected Markdown sections (title, Quick Start, parameters, steps, output, related)
- **Unit:** renderIndexResource lists all annotated workflows grouped by category
- **Integration:** registerWorkflowMcp registers expected count of resources and prompts on a mock McpServer
- **Integration:** Catalog entries for annotated workflows use real descriptions instead of thin stubs
- **Smoke:** Each workflow with metadata can be read as a resource and invoked as a prompt without errors

## Acceptance criteria

1. Every non-echo workflow has a WorkflowMeta registered
2. `resources/list` returns 12 resources (11 workflows + index)
3. `resources/read` for any workflow URI returns valid Markdown with all sections
4. `prompts/list` returns 12 prompts (11 workflows + choose)
5. `prompts/get` for any workflow prompt returns messages with documentation + goal framing
6. The search tool finds workflows by description keywords (not just name tokens)
7. All existing tests continue to pass
8. `npm run build` succeeds
