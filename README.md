# schwartz13

An MCP server for [Exa's Websets API](https://docs.exa.ai/reference/websets). Websets are self-updating collections of web entities (companies, people, papers) with search, enrichment, and monitoring capabilities.

## Unified Tool

A single MCP tool (`manage_websets`) dispatches to 60 operations across 11 domains:

```json
{
  "operation": "websets.create",
  "args": {
    "searchQuery": "AI startups in San Francisco",
    "searchCount": 20,
    "entity": {"type": "company"}
  }
}
```

## Operations Reference

| Domain | Operations | Count |
|--------|-----------|-------|
| **websets** | create, get, list, update, delete, cancel, preview, waitUntilIdle, getAll | 9 |
| **searches** | create, get, cancel | 3 |
| **items** | list, get, delete, getAll | 4 |
| **enrichments** | create, get, cancel, update, delete | 5 |
| **monitors** | create, get, list, update, delete, runs.list, runs.get, getAll | 8 |
| **webhooks** | create, get, list, update, delete, list_attempts, getAll, getAllAttempts | 8 |
| **imports** | create, get, list, update, delete, waitUntilCompleted, getAll | 7 |
| **events** | list, get, getAll | 3 |
| **tasks** | create, get, result, list, cancel | 5 |
| **research** | create, get, list, pollUntilFinished | 4 |
| **exa** | search, findSimilar, getContents, answer | 4 |

## Response Projections

All responses pass through domain-specific projection functions that extract decision-relevant fields and strip noise. This reduces agent context consumption by 10-100x per response.

- **Bulk items** filter out entities that failed all criteria evaluations
- **Entity type** promoted to top level (no more parsing `properties.type`)
- **Stripped**: timestamps, config objects, content blobs, reasoning chains, references
- **Preserved**: metadata, status, IDs, enrichment results
- **`items.get`** returns full raw response for single-item inspection

## Workflow Tasks

Long-running background tasks orchestrate multi-step research patterns. Create with `tasks.create`, poll with `tasks.get` / `tasks.result`.

| Type | Description | Key Args |
|------|-------------|----------|
| `lifecycle.harvest` | Search + enrich + collect | query, entity, enrichments?, count? |
| `convergent.search` | N queries, deduplicate, find intersection | queries, entity, criteria?, count? |
| `adversarial.verify` | Thesis vs antithesis + optional synthesis | thesis, thesisQuery, antithesisQuery, synthesize? |
| `qd.winnow` | Quality-diversity: criteria x enrichments | query, entity, criteria, enrichments, selectionStrategy? |
| `research.deep` | Exa Research API question answering | instructions, model?, outputSchema? |
| `research.verifiedCollection` | Collection + per-entity deep research | query, entity, researchPrompt, researchLimit? |
| `retrieval.searchAndRead` | Exa search + getContents for full text | query, numResults?, type?, category? |
| `retrieval.expandAndCollect` | Search + findSimilar on top results | query, numResults?, expandTop? |
| `retrieval.verifiedAnswer` | Exa answer + source verification | query, model?, numValidation? |

### Examples

**Search + enrich + collect:**
```json
{
  "operation": "tasks.create",
  "args": {
    "type": "lifecycle.harvest",
    "args": {
      "query": "AI startups in San Francisco",
      "entity": {"type": "company"},
      "enrichments": [
        {"description": "CEO name", "format": "text"},
        {"description": "Annual revenue in USD", "format": "number"}
      ],
      "count": 25
    }
  }
}
```

**Multi-angle triangulation:**
```json
{
  "operation": "tasks.create",
  "args": {
    "type": "convergent.search",
    "args": {
      "queries": [
        "companies building autonomous vehicles",
        "self-driving car startups with funding",
        "autonomous driving technology firms"
      ],
      "entity": {"type": "company"}
    }
  }
}
```

**Check progress / get results:**
```json
{"operation": "tasks.get", "args": {"taskId": "task_abc123"}}
{"operation": "tasks.result", "args": {"taskId": "task_abc123"}}
```

## Parameter Format Rules

| Parameter | Correct | Wrong |
|-----------|---------|-------|
| `criteria` | `[{"description": "..."}]` | `["criterion 1"]` |
| `entity` | `{"type": "company"}` | `"company"` |
| `options` | `[{"label": "..."}]` | `["option1"]` |
| `cron` | `"0 9 * * 1"` (5-field) | `"0 0 9 * * 1"` (6-field) |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- An Exa API key from [exa.ai](https://exa.ai)

### Claude Code

```bash
claude mcp add schwartz13 -e EXA_API_KEY=YOUR_API_KEY -- npx -y schwartz13
```

### Docker

```bash
EXA_API_KEY=your-key docker compose up --build
```

The server starts on port 7860 by default.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "schwartz13": {
      "command": "npx",
      "args": ["-y", "schwartz13"],
      "env": {
        "EXA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### HTTP Server (Cursor, etc.)

```json
{
  "mcpServers": {
    "schwartz13": {
      "type": "http",
      "url": "http://localhost:7860/mcp"
    }
  }
}
```

## Development

```bash
git clone https://github.com/Kastalien-Research/schwartz13.git
cd schwartz13
npm install
npm run build
npm start
```

### Test Scripts

```bash
npm test                 # Full suite (~365 tests)
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (requires EXA_API_KEY)
npm run test:e2e         # End-to-end tests
npm run test:workflows   # Workflow tests only
```

### Project Structure

```
schwartz13/
├── src/
│   ├── index.ts                 # Express server + MCP transport
│   ├── server.ts                # Server factory (createServer)
│   ├── tools/
│   │   └── manageWebsets.ts     # Unified dispatcher (56 operations)
│   ├── handlers/                # Domain handlers (10 files)
│   ├── workflows/               # Long-running task workflows (8 files)
│   ├── lib/
│   │   ├── exa.ts               # Exa client singleton
│   │   ├── projections.ts       # Response projection layer
│   │   ├── taskStore.ts         # In-memory task state store
│   │   └── semaphore.ts         # Concurrency limiter
│   └── utils/
│       └── logger.ts            # Debug logging
├── docs/adr/                    # Architecture decision records
├── Dockerfile
└── docker-compose.yml
```

## Resources

- [Exa Websets Documentation](https://docs.exa.ai/reference/websets)
- [Exa Dashboard](https://exa.ai/dashboard)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## License

MIT
