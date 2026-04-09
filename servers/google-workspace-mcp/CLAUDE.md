# Google Workspace MCP Server

Code Mode MCP server for Google Workspace APIs with a Gmail channel for Claude Code.

## Setup

### 1. Google OAuth Credentials

Create a Google Cloud project with Gmail, Calendar, Drive, Docs, Sheets, Slides, and Tasks APIs enabled. Create OAuth 2.0 credentials (Desktop app type).

Add to `.env.local`:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 2. Get a Refresh Token

```bash
npm run auth
```

Opens browser for OAuth consent. Prints the refresh token — add to `.env.local`:
```
GOOGLE_REFRESH_TOKEN=...
```

### 3. Start the HTTP Server

```bash
npm run build && npm start
```

Listens on `http://127.0.0.1:3000/mcp`. Override with `HOST` and `PORT` env vars.

### 4. Start with Channels

```bash
claude --dangerously-load-development-channels server:google-workspace-channel
```

The channel listens for Gmail notifications on port 3001 (`CHANNEL_PORT` to override).

**With Pub/Sub (recommended):** Set `GOOGLE_PUBSUB_TOPIC=projects/your-project/topics/gmail-notifications` for real-time push.

**Without Pub/Sub:** Falls back to polling every 30s for new unread messages.

In Codespaces, forward the webhook port publicly:
```bash
gh codespace ports visibility 3001:public -c $CODESPACE_NAME
```

## Architecture

- `src/env.ts` — loads `.env.local`, validates OAuth creds, creates authenticated Google API clients
- `src/catalog.ts` — hand-authored catalog of ~50 Google Workspace operations across 7 services
- `src/sandbox.ts` — VM sandbox for code execution with `google` clients + `helpers` (MIME, body extraction)
- `src/server.ts` — MCP server with `search` and `execute` tools (Code Mode pattern)
- `src/http.ts` — Express HTTP transport with session management
- `src/channel.ts` — Gmail channel: webhook listener + reply/draft/triage/summarize tools + polling fallback
- `src/index.ts` — Entry point: `--channel` / `--stdio` / `--auth` / default HTTP

## Known Issues

**HTTP MCP + Claude Code auth cascade** (anthropics/claude-code#33817): Claude Code's HTTP transport may trigger OAuth discovery before connecting. The server works around this with Accept header middleware and OAuth discovery routes in `src/http.ts`. Do not remove these.
