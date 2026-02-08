import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Exa } from 'exa-js';
import type { OperationHandler, ToolResult } from '../handlers/types.js';
import { createRequestLogger } from '../utils/logger.js';

import * as websets from '../handlers/websets.js';
import * as searches from '../handlers/searches.js';
import * as items from '../handlers/items.js';
import * as enrichments from '../handlers/enrichments.js';
import * as monitors from '../handlers/monitors.js';
import * as webhooks from '../handlers/webhooks.js';
import * as imports from '../handlers/imports.js';
import * as events from '../handlers/events.js';
import * as tasks from '../handlers/tasks.js';
import * as research from '../handlers/research.js';
import * as exaSearch from '../handlers/exa.js';

// Side-effect imports: register workflows in the registry
import '../workflows/echo.js';
import '../workflows/qdWinnow.js';
import '../workflows/researchDeep.js';
import '../workflows/lifecycle.js';
import '../workflows/adversarial.js';
import '../workflows/convergent.js';
import '../workflows/verifiedCollection.js';
import '../workflows/searchAndRead.js';
import '../workflows/expandAndCollect.js';
import '../workflows/verifiedAnswer.js';

// Operation metadata: name, handler, summary for description
interface OperationMeta {
  handler: OperationHandler;
  summary: string;
}

const OPERATIONS: Record<string, OperationMeta> = {
  // Websets domain
  'websets.create': { handler: websets.create, summary: 'Create a new webset (args: searchQuery, searchCount, searchCriteria, enrichments, name, description, externalId, metadata, entity)' },
  'websets.get': { handler: websets.get, summary: 'Get a webset by ID (args: id, expand?)' },
  'websets.list': { handler: websets.list, summary: 'List all websets (args: limit?, cursor?)' },
  'websets.update': { handler: websets.update, summary: 'Update webset metadata (args: id, metadata)' },
  'websets.delete': { handler: websets.del, summary: 'Delete a webset (args: id)' },
  'websets.cancel': { handler: websets.cancel, summary: 'Cancel a webset (args: id)' },
  'websets.preview': { handler: websets.preview, summary: 'Preview a webset query (args: query, count?, entity?, search?)' },
  'websets.waitUntilIdle': { handler: websets.waitUntilIdle, summary: 'Poll until webset status becomes idle (args: id, timeout?, pollInterval?). Defaults: timeout=300000ms, pollInterval=1000ms' },
  'websets.getAll': { handler: websets.getAll, summary: 'Auto-paginate all websets (args: maxItems?). Default maxItems=100' },

  // Searches domain
  'searches.create': { handler: searches.create, summary: 'Create a search on a webset (args: websetId, query, count?, entity?, criteria?, behavior?, recall?, metadata?)' },
  'searches.get': { handler: searches.get, summary: 'Get search status (args: websetId, searchId)' },
  'searches.cancel': { handler: searches.cancel, summary: 'Cancel a search (args: websetId, searchId)' },

  // Items domain
  'items.list': { handler: items.list, summary: 'List items in a webset (args: websetId, limit?, cursor?)' },
  'items.get': { handler: items.get, summary: 'Get a specific item (args: websetId, itemId)' },
  'items.delete': { handler: items.del, summary: 'Delete an item (args: websetId, itemId)' },
  'items.getAll': { handler: items.getAll, summary: 'Auto-paginate all items in a webset (args: websetId, maxItems?, sourceId?). Default maxItems=1000' },

  // Enrichments domain
  'enrichments.create': { handler: enrichments.create, summary: 'Create an enrichment (args: websetId, description, format?, options?, metadata?)' },
  'enrichments.get': { handler: enrichments.get, summary: 'Get enrichment status (args: websetId, enrichmentId)' },
  'enrichments.cancel': { handler: enrichments.cancel, summary: 'Cancel an enrichment (args: websetId, enrichmentId)' },
  'enrichments.update': { handler: enrichments.update, summary: 'Update an enrichment (args: websetId, enrichmentId, description?, format?, options?, metadata?)' },
  'enrichments.delete': { handler: enrichments.del, summary: 'Delete an enrichment (args: websetId, enrichmentId)' },

  // Monitors domain
  'monitors.create': { handler: monitors.create, summary: 'Create a monitor (args: websetId, cron, timezone?, query?, criteria?, entity?, count?, behavior?, metadata?)' },
  'monitors.get': { handler: monitors.get, summary: 'Get a monitor (args: id)' },
  'monitors.list': { handler: monitors.list, summary: 'List monitors (args: limit?, cursor?, websetId?)' },
  'monitors.update': { handler: monitors.update, summary: 'Update a monitor (args: id, cadence?, behavior?, metadata?, status?)' },
  'monitors.delete': { handler: monitors.del, summary: 'Delete a monitor (args: id)' },
  'monitors.getAll': { handler: monitors.getAll, summary: 'Auto-paginate all monitors (args: maxItems?, websetId?). Default maxItems=100' },
  'monitors.runs.list': { handler: monitors.runsList, summary: 'List monitor runs (args: monitorId, limit?, cursor?)' },
  'monitors.runs.get': { handler: monitors.runsGet, summary: 'Get a monitor run (args: monitorId, runId)' },

  // Webhooks domain
  'webhooks.create': { handler: webhooks.create, summary: 'Create a webhook (args: url, events, metadata?)' },
  'webhooks.get': { handler: webhooks.get, summary: 'Get a webhook (args: id)' },
  'webhooks.list': { handler: webhooks.list, summary: 'List webhooks (args: limit?, cursor?)' },
  'webhooks.update': { handler: webhooks.update, summary: 'Update a webhook (args: id, url?, events?, metadata?)' },
  'webhooks.delete': { handler: webhooks.del, summary: 'Delete a webhook (args: id)' },
  'webhooks.list_attempts': { handler: webhooks.listAttempts, summary: 'List webhook delivery attempts (args: id, limit?, cursor?, eventType?, successful?)' },
  'webhooks.getAll': { handler: webhooks.getAll, summary: 'Auto-paginate all webhooks (args: maxItems?). Default maxItems=100' },
  'webhooks.getAllAttempts': { handler: webhooks.getAllAttempts, summary: 'Auto-paginate all webhook attempts (args: id, maxItems?, eventType?, successful?). Default maxItems=500' },

  // Imports domain
  'imports.create': { handler: imports.create, summary: 'Create an import (args: format, entity, count, size, title?, csv?, metadata?)' },
  'imports.get': { handler: imports.get, summary: 'Get an import (args: id)' },
  'imports.list': { handler: imports.list, summary: 'List imports (args: limit?, cursor?)' },
  'imports.update': { handler: imports.update, summary: 'Update an import (args: id, metadata?, title?)' },
  'imports.delete': { handler: imports.del, summary: 'Delete an import (args: id)' },
  'imports.waitUntilCompleted': { handler: imports.waitUntilCompleted, summary: 'Poll until import completes or fails (args: id, timeout?, pollInterval?). Defaults: timeout=300000ms, pollInterval=2000ms' },
  'imports.getAll': { handler: imports.getAll, summary: 'Auto-paginate all imports (args: maxItems?). Default maxItems=100' },

  // Events domain
  'events.list': { handler: events.list, summary: 'List events (args: limit?, cursor?, types?)' },
  'events.get': { handler: events.get, summary: 'Get an event (args: id)' },
  'events.getAll': { handler: events.getAll, summary: 'Auto-paginate all events (args: maxItems?, types?). Default maxItems=1000' },

  // Tasks domain (background task orchestrator)
  'tasks.create': {
    handler: tasks.create,
    summary: 'Create a background task (args: type, args?). Types:\n' +
      '  echo — test workflow (args: message, delayMs?)\n' +
      '  qd.winnow — quality-diversity search: criteria as behavioral coordinates + enrichments as fitness (args: query, entity, criteria, enrichments, count?, selectionStrategy?, critique?)\n' +
      '  lifecycle.harvest — create webset, search, enrich, collect all items (args: query, entity, enrichments?, count?, cleanup?)\n' +
      '  convergent.search — N queries from different angles, deduplicate, find intersection (args: queries, entity, criteria?, count?)\n' +
      '  adversarial.verify — thesis vs antithesis websets + optional synthesis (args: thesis, thesisQuery, antithesisQuery, entity?, synthesize?)\n' +
      '  research.deep — Exa Research API wrapper (args: instructions, model?, outputSchema?)\n' +
      '  research.verifiedCollection — webset collection + per-entity deep research (args: query, entity, researchPrompt, researchLimit?, researchSchema?)\n' +
      '  retrieval.searchAndRead — search + read full contents of top results (args: query, numResults?, type?, category?, includeDomains?, excludeDomains?, date filters)\n' +
      '  retrieval.expandAndCollect — search + expand via findSimilar + deduplicate (args: query, numResults?, expandTop?, category?, date filters)\n' +
      '  retrieval.verifiedAnswer — answer with citations + independent validation (args: query, model?, systemPrompt?, numValidation?)',
  },
  'tasks.get': { handler: tasks.get, summary: 'Get task status and progress (args: taskId)' },
  'tasks.result': { handler: tasks.result, summary: 'Get task result when completed (args: taskId)' },
  'tasks.list': { handler: tasks.list, summary: 'List tasks, optionally filtered by status (args: status?)' },
  'tasks.cancel': { handler: tasks.cancel, summary: 'Cancel a running task (args: taskId)' },

  // Research domain (Exa Research API)
  'research.create': { handler: research.create, summary: 'Create a research request (args: instructions, model?, outputSchema?)' },
  'research.get': { handler: research.get, summary: 'Get research status (args: researchId, events?)' },
  'research.list': { handler: research.list, summary: 'List research requests (args: cursor?, limit?)' },
  'research.pollUntilFinished': { handler: research.pollUntilFinished, summary: 'Poll until research completes (args: researchId, pollInterval?, timeoutMs?, events?)' },

  // Exa Search API domain (synchronous web search)
  'exa.search': { handler: exaSearch.search, summary: 'Instant web search (args: query, type?, numResults?, category?, includeDomains?, excludeDomains?, startCrawlDate?, endCrawlDate?, startPublishedDate?, endPublishedDate?, contents?, includeText?, excludeText?, additionalQueries?, userLocation?, moderation?, useAutoprompt?)' },
  'exa.findSimilar': { handler: exaSearch.findSimilar, summary: 'Find pages similar to a URL (args: url, numResults?, excludeSourceDomain?, includeDomains?, excludeDomains?, startCrawlDate?, endCrawlDate?, startPublishedDate?, endPublishedDate?, contents?, includeText?, excludeText?, category?, userLocation?)' },
  'exa.getContents': { handler: exaSearch.getContents, summary: 'Extract content from URLs (args: urls, text?, highlights?, summary?, livecrawl?, livecrawlTimeout?, maxAgeHours?, subpages?, subpageTarget?, extras?, context?)' },
  'exa.answer': { handler: exaSearch.answer, summary: 'Question answering with citations (args: query, text?, model?, systemPrompt?, outputSchema?, userLocation?)' },
};

const OPERATION_NAMES = Object.keys(OPERATIONS) as [string, ...string[]];

function buildToolDescription(): string {
  const groups: Record<string, string[]> = {};
  for (const [name, meta] of Object.entries(OPERATIONS)) {
    const domain = name.split('.')[0];
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(`  ${name} — ${meta.summary}`);
  }

  const sections = Object.entries(groups)
    .map(([domain, ops]) => `${domain.toUpperCase()}:\n${ops.join('\n')}`)
    .join('\n\n');

  return `Manage Exa Websets & Search API — unified tool for all Exa operations.

Choose an operation and pass its arguments in the args object.

QUICK START:
- Instant web search: exa.search
- Find similar pages: exa.findSimilar
- Extract page content: exa.getContents
- Question answering with citations: exa.answer
- Entity collection (webset): websets.create → websets.waitUntilIdle → items.getAll
- Search + enrich + collect in one task: tasks.create type=lifecycle.harvest
- Multi-angle triangulation: tasks.create type=convergent.search
- Quality-diversity analysis: tasks.create type=qd.winnow
- Deep research question: tasks.create type=research.deep
- Search + read pages: tasks.create type=retrieval.searchAndRead
- Search + expand similar: tasks.create type=retrieval.expandAndCollect
- Answer + verify: tasks.create type=retrieval.verifiedAnswer

WORKFLOW GUIDE (long-running background tasks via tasks.create):
  lifecycle.harvest — search + enrich + collect (simplest end-to-end)
  convergent.search — N queries → deduplicate → intersection (high-confidence discovery)
  adversarial.verify — thesis vs antithesis + optional synthesis (bias testing)
  qd.winnow — criteria × enrichments quality-diversity analysis (advanced)
  research.deep — Exa Research API question answering
  research.verifiedCollection — entity collection + per-entity deep research
  retrieval.searchAndRead — instant search + full page read (fastest retrieval workflow)
  retrieval.expandAndCollect — search + findSimilar expansion + deduplication
  retrieval.verifiedAnswer — answer with citations + independent source validation

PARAMETER FORMAT RULES:
- criteria: MUST be [{description: "..."}] (array of objects, NOT strings)
- entity: MUST be {type: "company"} (object, NOT string)
- options: MUST be [{label: "..."}] (array of objects, NOT strings)
- cron: MUST be 5-field format "minute hour day month weekday"

OPERATIONS:

${sections}`;
}

export function registerManageWebsetsTool(server: McpServer, exa: Exa): void {
  server.registerTool(
    'manage_websets',
    {
      description: buildToolDescription(),
      inputSchema: {
        operation: z.enum(OPERATION_NAMES).describe('The operation to perform'),
        args: z.record(z.string(), z.unknown()).optional().describe('Operation-specific arguments'),
      },
    },
    async ({ operation, args }) => {
      const requestId = `manage_websets-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const logger = createRequestLogger(requestId, operation);

      logger.start(operation);

      const meta = OPERATIONS[operation];
      if (!meta) {
        return {
          content: [{ type: 'text' as const, text: `Unknown operation: ${operation}` }],
          isError: true,
        };
      }

      const result = await meta.handler(args || {}, exa);

      if (result.isError) {
        logger.error(result.content[0]?.text || 'Unknown error');
      } else {
        logger.complete();
      }

      return result;
    },
  );
}
