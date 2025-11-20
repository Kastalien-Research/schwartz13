# Exa Websets MCP Server

[![smithery badge](https://smithery.ai/badge/@exa-labs/websets-mcp-server)](https://smithery.ai/server/@exa-labs/websets-mcp-server)

A Model Context Protocol (MCP) server that integrates [Exa's Websets API](https://docs.exa.ai/reference/websets) with Claude Desktop, Cursor, Windsurf, and other MCP-compatible clients.

## What are Websets?

Websets are collections of web entities (companies, people, research papers) that can be automatically discovered, verified, and enriched with custom data. Think of them as smart, self-updating spreadsheets powered by AI web research.

**Key capabilities:**
- 🔍 **Automated Search**: Find entities matching natural language criteria
- 📊 **Data Enrichment**: Extract custom information using AI agents
- 🔄 **Monitoring**: Schedule automatic updates to keep collections fresh
- 🎯 **Verification**: AI validates that entities meet your criteria
- 🔗 **Webhooks**: Real-time notifications for collection updates

## Available Tools

This MCP server provides the following tools:

### Webset Management
| Tool | Description |
| ---- | ----------- |
| `create_webset` | Create a new webset collection with optional search and enrichments |
| `list_websets` | List all your websets with pagination support |
| `get_webset` | Get details about a specific webset |
| `update_webset` | Update a webset's metadata |
| `delete_webset` | Delete a webset and all its items |

### Item Management
| Tool | Description |
| ---- | ----------- |
| `list_webset_items` | List all items (entities) in a webset |
| `get_item` | Get a specific item from a webset with all enrichment data |

### Search Operations
| Tool | Description |
| ---- | ----------- |
| `create_search` | Create a new search to find and add items to a webset |
| `get_search` | Get details about a specific search including status and progress |
| `cancel_search` | Cancel a running search operation |

### Enrichment Operations
| Tool | Description |
| ---- | ----------- |
| `create_enrichment` | Add a new data enrichment to extract custom information |
| `get_enrichment` | Get details about a specific enrichment |
| `update_enrichment` | Update an enrichment's metadata |
| `delete_enrichment` | Delete an enrichment and all its data |
| `cancel_enrichment` | Cancel a running enrichment operation |

### Monitoring
| Tool | Description |
| ---- | ----------- |
| `create_monitor` | Set up automated monitoring to keep the webset updated |

## Installation

### Installing via Smithery

To install Exa Websets automatically via [Smithery](https://smithery.ai/server/@exa-labs/websets-mcp-server):

```bash
npx -y @smithery/cli install @exa-labs/websets-mcp-server
```

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Claude Desktop](https://claude.ai/download), [Cursor](https://cursor.sh/), or another MCP-compatible client
- An Exa API key from [exa.ai](https://exa.ai)

### Using Claude Code (Recommended)

The quickest way to set up Websets MCP:

```bash
claude mcp add websets -e EXA_API_KEY=YOUR_API_KEY -- npx -y websets-mcp-server
```

Replace `YOUR_API_KEY` with your Exa API key.

### Using NPX

```bash
# Install globally
npm install -g websets-mcp-server

# Or run directly with npx
npx websets-mcp-server
```

## Configuration

### Claude Desktop Configuration

1. **Enable Developer Mode**
   - Open Claude Desktop
   - Click the menu → Enable Developer Mode
   - Go to Settings → Developer → Edit Config

2. **Add to configuration file:**

   **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   
   **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "websets": {
         "command": "npx",
         "args": [
           "-y",
           "websets-mcp-server"
         ],
         "env": {
           "EXA_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop**
   - Completely quit Claude Desktop
   - Start it again
   - Look for the 🔌 icon to verify connection

### Cursor and Claude Code Configuration

Use the HTTP-based configuration:

```json
{
  "mcpServers": {
    "websets": {
      "type": "http",
      "url": "https://mcp.exa.ai/websets",
      "headers": {}
    }
  }
}
```

## Tool Schema Reference

**⚠️ Important for AI Callers:** See [TOOL_SCHEMAS.md](./TOOL_SCHEMAS.md) for exact parameter formats and examples.

**Key Schema Rules:**
- `criteria` must be an array of objects: `[{description: "..."}]` (NOT an array of strings)
- `entity` must be an object: `{type: "company"}` (NOT a string)
- `options` must be an array of objects: `[{label: "..."}]` (NOT an array of strings)

These formats ensure consistency across all tools and match the Websets API specification.

## Usage Examples

Once configured, you can ask Claude to interact with Websets:

### Creating a Webset

```
Create a webset of AI startups in San Francisco with 20 companies. 
Add enrichments for revenue, employee count, and funding stage.
```

### Listing and Viewing Websets

```
List all my websets and show me the details of the one called "AI Startups"
```

### Managing Items

```
Show me the first 10 items from my "AI Startups" webset with all their enrichment data
```

### Setting Up Monitoring

```
Create a monitor for my "AI Startups" webset that searches for new companies 
every Monday at 9am using the cron schedule "0 9 * * 1"
```

### Advanced Enrichments

```
Add an enrichment to my webset that extracts the company's latest product launch 
and the CEO's LinkedIn profile
```

## Example Workflow

Here's a complete workflow for building a company research database:

1. **Create the collection:**
   ```
   Create a webset called "SaaS Companies" that searches for 
   "B2B SaaS companies with $10M+ revenue"
   ```

2. **Add enrichments:**
   ```
   Add enrichments to extract: annual recurring revenue, number of customers, 
   primary market segment, and tech stack used
   ```

3. **Set up monitoring:**
   ```
   Create a weekly monitor that searches for new companies and refreshes 
   enrichment data for existing ones
   ```

4. **View results:**
   ```
   Show me all items with their enrichment data, sorted by revenue
   ```

## Tool Details

### create_webset

Creates a new webset collection with optional automatic population and enrichments.

**Parameters:**
- `name` (optional): Name for the webset
- `description` (optional): Description of what the webset contains
- `externalId` (optional): Your own identifier
- `searchQuery` (optional): Natural language query to find entities
- `searchCount` (optional): Number of entities to find (default: 10)
- `searchCriteria` (optional): Additional filtering criteria
- `enrichments` (optional): Array of enrichments to extract

**Example:**
```json
{
  "name": "Tech Unicorns",
  "searchQuery": "Technology companies valued over $1 billion",
  "searchCount": 50,
  "searchCriteria": [
    {"description": "Valued at over $1 billion"},
    {"description": "Technology sector"}
  ],
  "enrichments": [
    {
      "description": "Current company valuation in USD",
      "format": "number"
    },
    {
      "description": "Names of company founders",
      "format": "text"
    },
    {
      "description": "Company stage",
      "format": "options",
      "options": [
        {"label": "Series A"},
        {"label": "Series B"},
        {"label": "Series C+"},
        {"label": "Public"}
      ]
    }
  ]
}
```

### create_enrichment

Adds a new data enrichment to extract custom information from each webset item.

**Parameters:**
- `websetId`: The ID of the webset
- `description`: Detailed description of what to extract

**Example:**
```json
{
  "websetId": "webset_abc123",
  "description": "Total number of full-time employees as of the most recent data"
}
```

### create_monitor

Sets up automated monitoring with a cron schedule.

**Parameters:**
- `websetId`: The ID of the webset
- `schedule`: Cron expression (e.g., "0 9 * * 1" for Mondays at 9am)
- `behavior`: Either "search" (find new items) or "refresh" (update existing)
- `name` (optional): Name for the monitor
- `enabled` (optional): Start enabled (default: true)

**Common cron schedules:**
- `0 9 * * 1` - Every Monday at 9am
- `0 0 * * *` - Daily at midnight
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1-5` - Weekdays at 9am

## API Endpoints

The server connects to Exa's Websets API at `https://api.exa.ai/v0/websets`.

Full API documentation: [docs.exa.ai/reference/websets](https://docs.exa.ai/reference/websets)

## Advanced Configuration

### Enable Specific Tools Only

To enable only certain tools, use the `enabledTools` config:

```json
{
  "mcpServers": {
    "websets": {
      "command": "npx",
      "args": [
        "-y",
        "websets-mcp-server",
        "--tools=create_webset,list_websets,list_webset_items"
      ],
      "env": {
        "EXA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Debug Mode

Enable debug logging to troubleshoot issues:

```json
{
  "mcpServers": {
    "websets": {
      "command": "npx",
      "args": [
        "-y",
        "websets-mcp-server",
        "--debug"
      ],
      "env": {
        "EXA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Troubleshooting

### Connection Issues

1. Verify your API key is valid
2. Ensure there are no spaces or quotes around the API key
3. Completely restart your MCP client (not just close the window)
4. Check the MCP logs for error messages

### API Rate Limits

Websets API has the following limits:
- Check your plan limits at [exa.ai/dashboard](https://exa.ai/dashboard)
- Use pagination for large websets
- Monitor API usage in your dashboard

### Common Errors

- **401 Unauthorized**: Invalid or missing API key
- **404 Not Found**: Webset ID doesn't exist or was deleted
- **422 Unprocessable**: Invalid query or criteria format
- **429 Rate Limited**: Too many requests, wait and retry

## Resources

- [Exa Websets Documentation](https://docs.exa.ai/reference/websets)
- [Exa Dashboard](https://exa.ai/dashboard)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Get an Exa API Key](https://exa.ai)

## Development

### Building from Source

```bash
git clone https://github.com/exa-labs/websets-mcp-server.git
cd websets-mcp-server
npm install
npm run build
```

### Project Structure

```
websets-mcp-server/
├── src/
│   ├── index.ts              # Main server setup
│   ├── types.ts              # TypeScript type definitions
│   ├── tools/                # MCP tool implementations
│   │   ├── config.ts         # API configuration
│   │   ├── createWebset.ts
│   │   ├── listWebsets.ts
│   │   ├── getWebset.ts
│   │   ├── updateWebset.ts
│   │   ├── deleteWebset.ts
│   │   ├── listItems.ts
│   │   ├── createEnrichment.ts
│   │   └── createMonitor.ts
│   └── utils/
│       └── logger.ts         # Logging utilities
├── package.json
└── tsconfig.json
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR at [github.com/exa-labs/websets-mcp-server](https://github.com/exa-labs/websets-mcp-server).

## Support

- Documentation: [docs.exa.ai](https://docs.exa.ai)
- Discord: [Join the Exa community](https://discord.gg/exa)
- Email: support@exa.ai
