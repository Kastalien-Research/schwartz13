# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Exa Websets MCP Server — a Model Context Protocol server that exposes Exa's Websets API as tools for Claude Desktop, Cursor, and other MCP clients. Websets are self-updating collections of web entities (companies, people, papers) with search, enrichment, and monitoring capabilities.

## Build & Development Commands

```bash
npm run build              # TypeScript compile to dist/ + chmod +x
npm run watch              # TypeScript watch mode (tsc --watch, outputs to dist/)
npm run start              # Run the server (node dist/index.js)
npm run dev                # Dev mode with auto-restart
npm run inspector          # Run MCP inspector against dist/index.js
npm run test               # Run tests (vitest run)
npx vitest run src/handlers/__tests__/enrichments.test.ts  # Run a single test file
```

## Architecture

### Unified Dispatcher (v2.0.0)

The server exposes a **single MCP tool** (`manage_websets`) that dispatches to 60 operations across 11 domains. This follows the Thoughtbox hub tool pattern.

### Entry Point

`src/index.ts` — Express + StreamableHTTPServerTransport. Registers the single `manage_websets` tool via `registerManageWebsetsTool(server, exa)`.

### Tool Input Schema

```typescript
{
  operation: z.enum([...60 operation names]),  // e.g. "websets.create", "searches.get"
  args: z.record(z.string(), z.unknown()).optional()  // operation-specific args
}
```

### Dispatcher

`src/tools/manageWebsets.ts` — contains the OPERATIONS registry (Map of operation name → handler + summary), builds the tool description, and dispatches to domain handlers.

### Domain Handlers (src/handlers/)

| File | Operations | Count |
|------|-----------|-------|
| `websets.ts` | create, get, list, update, delete, cancel, preview, waitUntilIdle, getAll | 9 |
| `searches.ts` | create, get, cancel | 3 |
| `items.ts` | list, get, delete, getAll | 4 |
| `enrichments.ts` | create, get, cancel, update, delete | 5 |
| `monitors.ts` | create, get, list, update, delete, runsList, runsGet, getAll | 8 |
| `webhooks.ts` | create, get, list, update, delete, listAttempts, getAll, getAllAttempts | 8 |
| `imports.ts` | create, get, list, update, delete, waitUntilCompleted, getAll | 7 |
| `events.ts` | list, get, getAll | 3 |
| `tasks.ts` | create, get, result, list, cancel | 5 |
| `research.ts` | create, get, list, pollUntilFinished | 4 |
| `exa.ts` | search, findSimilar, getContents, answer | 4 |

Each handler exports named functions with signature `(args: Record<string, unknown>, exa: Exa) => Promise<ToolResult>`.

### Response Projections (src/lib/projections.ts)

All handler responses pass through domain-specific projection functions that extract decision-relevant fields and drop noise (timestamps, config, content, reasoning). This reduces agent context usage by 10-100×. Key behaviors:
- **Items**: Bulk responses (`items.list`, `items.getAll`, workflow results) filter out items where no `evaluation.satisfied === "yes"` and project to `{id, name, url, entityType, description, evaluations, enrichments}`
- **Items (single)**: `items.get` returns full raw response for inspection
- **All domains**: Metadata preserved, timestamps/config stripped, entity type promoted to top level

### Workflows (src/workflows/)

Long-running background tasks created via `tasks.create`. Each workflow registers itself in the workflow registry on import.

| File | Type | Description |
|------|------|-------------|
| `helpers.ts` | — | Shared validators, polling, collection, WorkflowError, withSummary |
| `types.ts` | — | Workflow registry (registerWorkflow/workflowRegistry) |
| `echo.ts` | echo | Test workflow |
| `lifecycle.ts` | lifecycle.harvest | Search + enrich + collect all items |
| `convergent.ts` | convergent.search | N queries → deduplicate → intersection |
| `adversarial.ts` | adversarial.verify | Thesis vs antithesis + optional synthesis |
| `qdWinnow.ts` | qd.winnow | Quality-diversity: criteria × enrichments |
| `researchDeep.ts` | research.deep | Exa Research API wrapper |
| `verifiedCollection.ts` | research.verifiedCollection | Collection + per-entity deep research |
| `searchAndRead.ts` | retrieval.searchAndRead | Exa search + getContents for full text |
| `expandAndCollect.ts` | retrieval.expandAndCollect | Search + findSimilar on top results |
| `verifiedAnswer.ts` | retrieval.verifiedAnswer | Exa answer + source verification |

### Key Modules

- `src/handlers/types.ts` — `ToolResult`, `OperationHandler` types, `successResult()` and `errorResult()` helpers
- `src/lib/exa.ts` — Singleton Exa client
- `src/utils/logger.ts` — Debug-conditional stderr logging with request ID generation

### Application-Level Validations

Three handlers have validation beyond what the SDK enforces:
- `enrichments.create` — options required when format='options', max 150 options
- `monitors.create` — cron expression must have exactly 5 fields
- `searches.create` — error messages include "Common issues" hints

### Parameter Format Gotchas

AI callers commonly get these wrong:
- `criteria` must be `[{description: "..."}]` (array of objects, not strings)
- `entity` must be `{type: "company"}` (object, not string)
- `options` must be `[{label: "..."}]` (array of objects, not strings)
- `cron` must be 5-field format: `"minute hour day month weekday"`

## Testing

Tests use **Vitest** with config in `vitest.config.ts` (excludes `dist/` dir). Test files live in `src/handlers/__tests__/`, `src/workflows/__tests__/`, and `src/lib/__tests__/`. ~365 tests across 38 files. Tests mock the Exa client to verify handler logic, validation, projections, and error formatting.

## Environment

- **Required**: `EXA_API_KEY` environment variable (or passed via config)
- **Node**: >=20.0.0
- **Module system**: ESM (`"type": "module"` in package.json)
- TypeScript target: ES2022, module: Node16, strict mode

## Issue Tracking

This project uses **bd** (beads) for issue tracking. See `bd ready` for available work, `bd sync` to push beads state with git.
