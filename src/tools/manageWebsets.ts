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
import { applyCompatCoercions, type AppliedCoercion, type CompatMode } from './coercion.js';

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
import '../workflows/semanticCron.js';

// Operation metadata
interface OperationMeta {
  handler: OperationHandler;
  summary: string;
}

const OPERATIONS: Record<string, OperationMeta> = {
  'websets.create': { handler: websets.create, summary: 'Create a new webset' },
  'websets.get': { handler: websets.get, summary: 'Get a webset by ID' },
  'websets.list': { handler: websets.list, summary: 'List all websets' },
  'websets.update': { handler: websets.update, summary: 'Update webset metadata' },
  'websets.delete': { handler: websets.del, summary: 'Delete a webset' },
  'websets.cancel': { handler: websets.cancel, summary: 'Cancel a webset' },
  'websets.preview': { handler: websets.preview, summary: 'Preview a webset query' },
  'websets.waitUntilIdle': { handler: websets.waitUntilIdle, summary: 'Poll until webset status becomes idle' },
  'websets.getAll': { handler: websets.getAll, summary: 'Auto-paginate all websets' },
  'searches.create': { handler: searches.create, summary: 'Create a search on a webset' },
  'searches.get': { handler: searches.get, summary: 'Get search status' },
  'searches.cancel': { handler: searches.cancel, summary: 'Cancel a search' },
  'items.list': { handler: items.list, summary: 'List items in a webset' },
  'items.get': { handler: items.get, summary: 'Get a specific item' },
  'items.delete': { handler: items.del, summary: 'Delete an item' },
  'items.getAll': { handler: items.getAll, summary: 'Auto-paginate all items in a webset' },
  'enrichments.create': { handler: enrichments.create, summary: 'Create an enrichment' },
  'enrichments.get': { handler: enrichments.get, summary: 'Get enrichment status' },
  'enrichments.cancel': { handler: enrichments.cancel, summary: 'Cancel an enrichment' },
  'enrichments.update': { handler: enrichments.update, summary: 'Update an enrichment' },
  'enrichments.delete': { handler: enrichments.del, summary: 'Delete an enrichment' },
  'monitors.create': { handler: monitors.create, summary: 'Create a monitor' },
  'monitors.get': { handler: monitors.get, summary: 'Get a monitor' },
  'monitors.list': { handler: monitors.list, summary: 'List monitors' },
  'monitors.update': { handler: monitors.update, summary: 'Update a monitor' },
  'monitors.delete': { handler: monitors.del, summary: 'Delete a monitor' },
  'monitors.getAll': { handler: monitors.getAll, summary: 'Auto-paginate all monitors' },
  'monitors.runs.list': { handler: monitors.runsList, summary: 'List monitor runs' },
  'monitors.runs.get': { handler: monitors.runsGet, summary: 'Get a monitor run' },
  'webhooks.create': { handler: webhooks.create, summary: 'Create a webhook' },
  'webhooks.get': { handler: webhooks.get, summary: 'Get a webhook' },
  'webhooks.list': { handler: webhooks.list, summary: 'List webhooks' },
  'webhooks.update': { handler: webhooks.update, summary: 'Update a webhook' },
  'webhooks.delete': { handler: webhooks.del, summary: 'Delete a webhook' },
  'webhooks.list_attempts': { handler: webhooks.listAttempts, summary: 'List webhook delivery attempts' },
  'webhooks.getAll': { handler: webhooks.getAll, summary: 'Auto-paginate all webhooks' },
  'webhooks.getAllAttempts': { handler: webhooks.getAllAttempts, summary: 'Auto-paginate all webhook attempts' },
  'imports.create': { handler: imports.create, summary: 'Create an import' },
  'imports.get': { handler: imports.get, summary: 'Get an import' },
  'imports.list': { handler: imports.list, summary: 'List imports' },
  'imports.update': { handler: imports.update, summary: 'Update an import' },
  'imports.delete': { handler: imports.del, summary: 'Delete an import' },
  'imports.waitUntilCompleted': { handler: imports.waitUntilCompleted, summary: 'Poll until import completes or fails' },
  'imports.getAll': { handler: imports.getAll, summary: 'Auto-paginate all imports' },
  'events.list': { handler: events.list, summary: 'List events' },
  'events.get': { handler: events.get, summary: 'Get an event' },
  'events.getAll': { handler: events.getAll, summary: 'Auto-paginate all events' },
  'tasks.create': { handler: tasks.create, summary: 'Create a background task' },
  'tasks.get': { handler: tasks.get, summary: 'Get task status and progress' },
  'tasks.result': { handler: tasks.result, summary: 'Get task result when completed' },
  'tasks.list': { handler: tasks.list, summary: 'List tasks, optionally filtered by status' },
  'tasks.cancel': { handler: tasks.cancel, summary: 'Cancel a running task' },
  'research.create': { handler: research.create, summary: 'Create a research request' },
  'research.get': { handler: research.get, summary: 'Get research status' },
  'research.list': { handler: research.list, summary: 'List research requests' },
  'research.pollUntilFinished': { handler: research.pollUntilFinished, summary: 'Poll until research completes' },
  'exa.search': { handler: exaSearch.search, summary: 'Instant web search' },
  'exa.findSimilar': { handler: exaSearch.findSimilar, summary: 'Find pages similar to a URL' },
  'exa.getContents': { handler: exaSearch.getContents, summary: 'Extract content from URLs' },
  'exa.answer': { handler: exaSearch.answer, summary: 'Question answering with citations' },
};

const OPERATION_NAMES = Object.keys(OPERATIONS) as [string, ...string[]];

const OPERATION_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'websets.create': websets.Schemas.create,
  'websets.get': websets.Schemas.get,
  'websets.list': websets.Schemas.list,
  'websets.update': websets.Schemas.update,
  'websets.delete': websets.Schemas.del,
  'websets.cancel': websets.Schemas.cancel,
  'websets.preview': websets.Schemas.preview,
  'websets.waitUntilIdle': websets.Schemas.waitUntilIdle,
  'websets.getAll': websets.Schemas.getAll,
  'searches.create': searches.Schemas.create,
  'searches.get': searches.Schemas.get,
  'searches.cancel': searches.Schemas.cancel,
  'items.list': items.Schemas.list,
  'items.get': items.Schemas.get,
  'items.delete': items.Schemas.del,
  'items.getAll': items.Schemas.getAll,
  'enrichments.create': enrichments.Schemas.create,
  'enrichments.get': enrichments.Schemas.get,
  'enrichments.cancel': enrichments.Schemas.cancel,
  'enrichments.update': enrichments.Schemas.update,
  'enrichments.delete': enrichments.Schemas.del,
  'monitors.create': monitors.Schemas.create,
  'monitors.get': monitors.Schemas.get,
  'monitors.list': monitors.Schemas.list,
  'monitors.update': monitors.Schemas.update,
  'monitors.delete': monitors.Schemas.del,
  'monitors.getAll': monitors.Schemas.getAll,
  'monitors.runs.list': monitors.Schemas.runsList,
  'monitors.runs.get': monitors.Schemas.runsGet,
  'webhooks.create': webhooks.Schemas.create,
  'webhooks.get': webhooks.Schemas.get,
  'webhooks.list': webhooks.Schemas.list,
  'webhooks.update': webhooks.Schemas.update,
  'webhooks.delete': webhooks.Schemas.del,
  'webhooks.list_attempts': webhooks.Schemas.listAttempts,
  'webhooks.getAll': webhooks.Schemas.getAll,
  'webhooks.getAllAttempts': webhooks.Schemas.getAllAttempts,
  'imports.create': imports.Schemas.create,
  'imports.get': imports.Schemas.get,
  'imports.list': imports.Schemas.list,
  'imports.update': imports.Schemas.update,
  'imports.delete': imports.Schemas.del,
  'imports.waitUntilCompleted': imports.Schemas.waitUntilCompleted,
  'imports.getAll': imports.Schemas.getAll,
  'events.list': events.Schemas.list,
  'events.get': events.Schemas.get,
  'events.getAll': events.Schemas.getAll,
  'tasks.create': tasks.Schemas.create,
  'tasks.get': tasks.Schemas.get,
  'tasks.result': tasks.Schemas.result,
  'tasks.list': tasks.Schemas.list,
  'tasks.cancel': tasks.Schemas.cancel,
  'research.create': research.Schemas.create,
  'research.get': research.Schemas.get,
  'research.list': research.Schemas.list,
  'research.pollUntilFinished': research.Schemas.pollUntilFinished,
  'exa.search': exaSearch.Schemas.search,
  'exa.findSimilar': exaSearch.Schemas.findSimilar,
  'exa.getContents': exaSearch.Schemas.getContents,
  'exa.answer': exaSearch.Schemas.answer,
};

function buildInputSchema() {
  return z.object({
    operation: z.enum(OPERATION_NAMES).describe('The operation to perform'),
    args: z.record(z.string(), z.unknown()).optional().describe('Legacy operation-specific arguments envelope'),
  }).catchall(z.unknown());
}

interface ManageWebsetsOptions {
  defaultCompatMode?: CompatMode;
}

function withCoercionMetadata(
  result: ToolResult,
  coercions: AppliedCoercion[],
  warnings: string[],
): ToolResult {
  if (coercions.length === 0 && warnings.length === 0) return result;

  if (result.isError) {
    const lines: string[] = [];
    if (coercions.length > 0) {
      lines.push('Coercions applied:');
      for (const c of coercions) {
        lines.push(`- ${c.path}: ${c.from} -> ${c.to}`);
      }
    }
    if (warnings.length > 0) {
      lines.push('Warnings:');
      for (const w of warnings) {
        lines.push(`- ${w}`);
      }
    }

    return {
      ...result,
      content: [{
        type: 'text',
        text: `${result.content[0]?.text ?? ''}\n\n${lines.join('\n')}`.trim(),
      }],
    };
  }

  const rawText = result.content[0]?.text;
  if (!rawText) return result;

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return result;
    }

    const enriched = parsed as Record<string, unknown>;
    if (coercions.length > 0) enriched._coercions = coercions;
    if (warnings.length > 0) enriched._warnings = warnings;

    return {
      ...result,
      content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
    };
  } catch {
    return result;
  }
}

function buildToolDescription(): string {
  return `Manage Exa Websets & Search API — unified tool for all Exa operations.

Choose an operation and pass its arguments as top-level properties (preferred) or in args object (legacy).

QUICK START:
- Instant web search: exa.search
- Find similar pages: exa.findSimilar
- Extract page content: exa.getContents
- Question answering with citations: exa.answer
- Entity collection (webset): websets.create → websets.waitUntilIdle → items.getAll
- Search + enrich + collect in one task: tasks.create type=lifecycle.harvest
- Multi-angle triangulation: tasks.create type=convergent.search
- Quality-diversity analysis: tasks.create type=qd.winnow (args: query, entity, criteria, enrichments, count?, selectionStrategy?, critique?)
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
- cron: MUST be 5-field format "minute hour day month weekday"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeInput(input: Record<string, unknown>): {
  operation: string;
  args: Record<string, unknown>;
} {
  const operation = String(input.operation);
  const legacyArgs = isRecord(input.args) ? input.args : {};
  const { operation: _operation, args: _args, ...rest } = input;
  return {
    operation,
    args: {
      ...legacyArgs,
      ...(rest as Record<string, unknown>),
    },
  };
}

function formatValidationError(operation: string, issues: z.ZodIssue[]): ToolResult {
  const details = issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `- ${path}: ${issue.message}`;
    })
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `Error in ${operation}: Validation failed\n${details}`,
    }],
    isError: true,
  };
}

export function registerManageWebsetsTool(
  server: McpServer,
  exa: Exa,
  options: ManageWebsetsOptions = {},
): void {
  const defaultCompatMode = options.defaultCompatMode ?? 'strict';

  server.registerTool(
    'manage_websets',
    {
      description: buildToolDescription(),
      inputSchema: buildInputSchema() as any,
    },
    async (input: any) => {
      const { operation, args } = normalizeInput(input as Record<string, unknown>);
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

      const coercion = applyCompatCoercions(
        operation,
        (args || {}) as Record<string, unknown>,
        defaultCompatMode,
      );
      const schema = OPERATION_SCHEMAS[operation];
      const validation = schema.safeParse(coercion.args);
      if (!validation.success) {
        logger.error(validation.error.message);
        const validationResult = formatValidationError(operation, validation.error.issues);
        return withCoercionMetadata(
          validationResult,
          coercion.coercions,
          coercion.warnings,
        );
      }
      const validatedArgs = validation.data as Record<string, unknown>;

      // Handle dry-run preview if requested via compat.preview
      if ((coercion as any).preview) {
        const previewResult: ToolResult = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              preview: true,
              operation,
              execution: 'skipped',
              effectiveCompatMode: (coercion as any).effectiveMode || defaultCompatMode,
              normalizedArgs: validatedArgs,
            }, null, 2),
          }],
        };

        const finalPreviewResult = withCoercionMetadata(
          previewResult,
          coercion.coercions,
          coercion.warnings,
        );
        logger.complete();
        return finalPreviewResult;
      }

      const result = await meta.handler(validatedArgs, exa);
      const finalResult = withCoercionMetadata(result, coercion.coercions, coercion.warnings);

      if (finalResult.isError) {
        logger.error(finalResult.content[0]?.text || 'Unknown error');
      } else {
        logger.complete();
      }

      return finalResult;
    },
  );
}
