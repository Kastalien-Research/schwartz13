# AgentMail MCP Server

An MCP server for the [AgentMail](https://agentmail.to) API using the **code mode** pattern — two meta-tools (`search` + `execute`) instead of one tool per API operation. Includes a **channel server** for real-time webhook-driven email notifications.

## Setup

### 1. Get an API key

Get an **inbox-scoped** API key from [AgentMail](https://app.agentmail.to). Inbox-scoped keys (`am_us_inbox_...`) are required for send/reply operations.

Create a `.env.local` file in the project root:

```
AGENTMAIL_API_KEY=am_us_inbox_...
```

### 2. Build

```bash
pnpm install
pnpm build
```

### 3. Start the HTTP server

```bash
pnpm start
```

The server listens on `http://127.0.0.1:3000/mcp`.

## MCP Configuration

### HTTP server (code mode)

Add to your `.mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "agentmail": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Stdio transport

```json
{
  "mcpServers": {
    "agentmail": {
      "command": "npx",
      "args": ["-y", "agentmail-mcp"],
      "env": {
        "AGENTMAIL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

## Tools

The server exposes two tools:

| Tool | Description |
|------|-------------|
| `search` | Discover available AgentMail operations. Returns names, descriptions, and optionally parameter schemas. |
| `execute` | Run JavaScript code against the AgentMail API. An authenticated `agentmail` client is available in scope. |

The LLM uses `search` to discover operations, then writes code for `execute` to call them — no per-operation tool definitions needed.

## Channel Plugin

The channel server pushes inbound email events into a live Claude Code session and exposes tools for replying, drafting, triaging, and more. It can be installed as a Claude Code plugin or run standalone.

### Install as a plugin

Add the marketplace, install the plugin, then launch with the channel:

```bash
/plugin marketplace add glassBead-tc/agentmail-mcp-codemode
/plugin install agentmail@agentmail-mcp-codemode
```

Then launch Claude Code with the channel enabled:

```bash
claude --dangerously-load-development-channels plugin:agentmail@agentmail-mcp-codemode
```

Run `/agentmail:setup` for guided configuration of API keys and webhooks.

### Run standalone (development)

```bash
# Start the HTTP server first
pnpm start

# Then launch Claude Code with the channel
claude --dangerously-load-development-channels server:agentmail-channel
```

The channel listens for webhooks on port 3001. Point your AgentMail webhook at:

```
http://localhost:3001/webhook
```

### Channel tools

| Tool | Description |
|------|-------------|
| `reply` | Reply to an email using inbox_id and message_id from the notification |
| `draft_for_review` | Create a draft for human approval |
| `approve_draft` | Send an approved draft |
| `reject_draft` | Delete a rejected draft |
| `summarize_thread` | Fetch a thread and return a structured digest |
| `triage` | Scan an inbox for threads needing attention |
| `onboard_tenant` | Provision a pod, inbox, and webhook in one call |

### Channel configuration

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "agentmail-channel": {
      "type": "stdio",
      "command": "node",
      "args": ["build/index.js", "--channel"],
      "cwd": "/path/to/agentmail-mcp",
      "env": {
        "AGENTMAIL_API_KEY": "${AGENTMAIL_API_KEY}"
      }
    }
  }
}
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTMAIL_API_KEY` | — | Required. Loaded from env or `.env.local`. |
| `AGENTMAIL_BASE_URL` | `https://api.agentmail.to/v0` | Override for non-default API host. |
| `HOST` | `127.0.0.1` | HTTP server bind address. |
| `PORT` | `3000` | HTTP server port. |
| `CHANNEL_PORT` | `3001` | Channel webhook listener port. |
| `CHANNEL_HOST` | `127.0.0.1` | Channel webhook listener bind address. |
| `CHANNEL_VERBOSE` | `0` | Set to `1` to push all event types, not just `message.received`. |

## License

MIT
