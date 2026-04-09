# AgentMail MCP Server

## API Keys

Use an **inbox-scoped** key (`am_us_inbox_...`) for all servers. Org-scoped keys (`am_us_...`) can list inboxes but get 403 on send/reply/draft operations.

Store in `.env.local` (gitignored):
```
AGENTMAIL_API_KEY=am_us_inbox_...
```

The server loads it automatically via `src/env.ts`. A startup warning is logged if the key prefix is wrong.

## Starting the HTTP Server

```bash
pnpm build && pnpm start
```

Listens on `http://127.0.0.1:3000/mcp`. Override with `HOST` and `PORT` env vars.

## Starting with Channels

```bash
claude --dangerously-load-development-channels server:agentmail-channel
```

The channel server listens for webhooks on port 3001 (`CHANNEL_PORT` to override). In Codespaces, forward this port publicly:

```bash
gh codespace ports visibility 3001:public -c $CODESPACE_NAME
```

Webhook URL: `https://<CODESPACE_NAME>-3001.app.github.dev/webhook`

By default only `message.received` events are pushed as notifications. Set `CHANNEL_VERBOSE=1` in `.mcp.json` env to see all event types.

## Known Issues

**HTTP MCP + Claude Code auth cascade** (anthropics/claude-code#33817): Claude Code's HTTP transport may trigger OAuth discovery before connecting. The server works around this with Accept header middleware and OAuth discovery routes in `src/http.ts`. Do not remove these.

## Architecture

- `src/env.ts` — shared config: loads `.env.local`, validates API key prefix, exports `createClient()`
- `src/server.ts` — MCP server with `search` and `execute` tools (code mode pattern)
- `src/http.ts` — Express HTTP transport for the MCP server
- `src/channel.ts` — Channel MCP server: webhook listener + reply/draft/triage/summarize/onboard tools
- `src/sandbox.ts` — VM sandbox for code execution
- `src/catalog.ts` — tool discovery catalog from agentmail-toolkit
