# Exa Websets MCP Server

[![smithery badge](https://smithery.ai/badge/@exa-labs/websets-mcp-server)](https://smithery.ai/server/@exa-labs/websets-mcp-server)

A Model Context Protocol (MCP) server that integrates [Exa's Websets API](https://docs.exa.ai/reference/websets) with Claude Desktop, Cursor, Windsurf, and other MCP-compatible clients.

## What are Websets?

Websets are collections of web entities (companies, people, research papers) that can be automatically discovered, verified, and enriched with custom data. Think of them as smart, self-updating spreadsheets powered by AI web research.

**Key capabilities:**
- **Automated Search**: Find entities matching natural language criteria
- **Data Enrichment**: Extract custom information using AI agents
- **Monitoring**: Schedule automatic updates to keep collections fresh
- **Verification**: AI validates that entities meet your criteria
- **Webhooks**: Real-time notifications for collection updates
- **Workflows**: Long-running background tasks for multi-step research patterns

## Unified Tool

This server exposes a **single MCP tool** called `manage_websets` that dispatches to 56 operations across 10 domains. Every call follows the same pattern:

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

## Workflow Tasks

Long-running background tasks orchestrate multi-step research patterns. Create them with `tasks.create` and poll with `tasks.get` / `tasks.result`.

| Type | Description | Key Args |
|------|-------------|----------|
| `lifecycle.harvest` | Search + enrich + collect (simplest end-to-end) | query, entity, enrichments?, count? |
| `convergent.search` | N queries from different angles, deduplicate, find intersection | queries, entity, criteria?, count? |
| `adversarial.verify` | Thesis vs antithesis websets + optional synthesis | thesis, thesisQuery, antithesisQuery, synthesize? |
| `qd.winnow` | Quality-diversity: criteria as coordinates, enrichments as fitness | query, entity, criteria, enrichments, selectionStrategy? |
| `research.deep` | Exa Research API question answering | instructions, model?, outputSchema? |
| `research.verifiedCollection` | Entity collection + per-entity deep research | query, entity, researchPrompt, researchLimit? |

### Workflow Examples

**Search + enrich + collect in one step:**
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

**Check task progress / get results:**
```json
{"operation": "tasks.get", "args": {"taskId": "task_abc123"}}
{"operation": "tasks.result", "args": {"taskId": "task_abc123"}}
```

## Parameter Format Rules

AI callers commonly get these wrong:

| Parameter | Correct | Wrong |
|-----------|---------|-------|
| `criteria` | `[{"description": "..."}]` | `["criterion 1"]` |
| `entity` | `{"type": "company"}` | `"company"` |
| `options` | `[{"label": "..."}]` | `["option1"]` |
| `cron` | `"0 9 * * 1"` (5-field) | `"0 0 9 * * 1"` (6-field) |

## Installation

### Installing via Smithery

```bash
npx -y @smithery/cli install @exa-labs/websets-mcp-server
```

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- An Exa API key from [exa.ai](https://exa.ai)

### Using Claude Code (Recommended)

```bash
claude mcp add websets -e EXA_API_KEY=YOUR_API_KEY -- npx -y websets-mcp-server
```

### Using NPX

```bash
npx -y websets-mcp-server
```

### Using Docker

```bash
EXA_API_KEY=your-key docker compose up --build
```

The server starts on port 7860 by default.

## Configuration

### Claude Desktop

1. Open Claude Desktop → Enable Developer Mode → Settings → Developer → Edit Config

2. Add to configuration file:

   **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "websets": {
         "command": "npx",
         "args": ["-y", "websets-mcp-server"],
         "env": {
           "EXA_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```

3. Restart Claude Desktop

### HTTP Server (Cursor, Claude Code, etc.)

The server runs as an HTTP endpoint using StreamableHTTP transport:

```json
{
  "mcpServers": {
    "websets": {
      "type": "http",
      "url": "http://localhost:7860/mcp"
    }
  }
}
```

## Usage Examples

### Simple Entity Search

```
Create a webset of AI startups in San Francisco with 20 companies.
Add enrichments for revenue, employee count, and funding stage.
```

### End-to-End Workflow

```
Use lifecycle.harvest to find 25 AI companies in healthcare,
enrich with CEO name and annual revenue, then show me the results.
```

### Deep Research

```
Use research.deep to answer: "What are the leading approaches
to protein folding prediction as of 2025?"
```

### Adversarial Verification

```
Use adversarial.verify to test the thesis "Remote work improves
developer productivity" — search for supporting and counter-evidence.
```

## Troubleshooting

### Connection Issues

1. Verify your API key is valid
2. Ensure there are no spaces or quotes around the API key
3. Completely restart your MCP client
4. Check the MCP logs for error messages

### API Rate Limits

- Check your plan limits at [exa.ai/dashboard](https://exa.ai/dashboard)
- Use pagination for large websets (items.getAll with maxItems)
- Monitor API usage in your dashboard

### Common Errors

- **401 Unauthorized**: Invalid or missing API key
- **404 Not Found**: Webset ID doesn't exist or was deleted
- **422 Unprocessable**: Invalid query or criteria format — check parameter format rules above
- **429 Rate Limited**: Too many requests, wait and retry

## Development

### Building from Source

```bash
git clone https://github.com/exa-labs/websets-mcp-server.git
cd websets-mcp-server
npm install
npm run build
npm start
```

### Project Structure

```
websets-mcp-server/
├── src/
│   ├── index.ts                 # Express server + MCP transport
│   ├── server.ts                # Server factory (createServer)
│   ├── tools/
│   │   └── manageWebsets.ts     # Unified dispatcher (56 operations)
│   ├── handlers/                # Domain handlers
│   │   ├── types.ts             # ToolResult, OperationHandler types
│   │   ├── websets.ts           # Webset CRUD + convenience ops
│   │   ├── searches.ts          # Search operations
│   │   ├── items.ts             # Item operations
│   │   ├── enrichments.ts       # Enrichment operations
│   │   ├── monitors.ts          # Monitor + runs operations
│   │   ├── webhooks.ts          # Webhook operations
│   │   ├── imports.ts           # Import operations
│   │   ├── events.ts            # Event operations
│   │   ├── tasks.ts             # Background task orchestrator
│   │   └── research.ts          # Exa Research API
│   ├── workflows/               # Long-running task workflows
│   │   ├── types.ts             # Workflow registry
│   │   ├── helpers.ts           # Shared utilities + validators
│   │   ├── echo.ts              # Test workflow
│   │   ├── qdWinnow.ts          # Quality-diversity search
│   │   ├── lifecycle.ts         # Search + enrich + collect
│   │   ├── convergent.ts        # Multi-query triangulation
│   │   ├── adversarial.ts       # Thesis vs antithesis
│   │   ├── researchDeep.ts      # Research API wrapper
│   │   └── verifiedCollection.ts # Collection + per-entity research
│   ├── lib/
│   │   ├── exa.ts               # Exa client singleton
│   │   ├── taskStore.ts         # In-memory task state store
│   │   └── semaphore.ts         # Concurrency limiter
│   └── utils/
│       └── logger.ts            # Debug logging
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

### Test Scripts

```bash
npm test                 # Full suite
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (requires EXA_API_KEY)
npm run test:e2e         # End-to-end tests
npm run test:workflows   # Workflow tests only
```

## Resources

- [Exa Websets Documentation](https://docs.exa.ai/reference/websets)
- [Exa Dashboard](https://exa.ai/dashboard)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Get an Exa API Key](https://exa.ai)

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR at [github.com/exa-labs/websets-mcp-server](https://github.com/exa-labs/websets-mcp-server).

## Support

- Documentation: [docs.exa.ai](https://docs.exa.ai)
- Discord: [Join the Exa community](https://discord.gg/exa)
- Email: support@exa.ai
