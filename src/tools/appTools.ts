import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import type { Exa } from 'exa-js';
import { OPERATIONS, OPERATION_SCHEMAS } from './manageWebsets.js';
import * as items from '../handlers/items.js';
import * as websets from '../handlers/websets.js';
import * as searches from '../handlers/searches.js';
import * as enrichments from '../handlers/enrichments.js';
import * as monitors from '../handlers/monitors.js';
import { projectWebset } from '../lib/projections.js';

const DIST_DIR = path.join(import.meta.dirname, '..');
const RESOURCE_URI = 'ui://schwartz13/mcp-app.html';

// ── Operations Guide helpers (kept for describe_operations) ──

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
}

function extractSchemaFields(schema: z.ZodTypeAny): SchemaField[] {
  const fields: SchemaField[] = [];
  const def = (schema as any)._def;
  if (!def) return fields;

  let shape: Record<string, z.ZodTypeAny> | undefined;
  if (def.typeName === 'ZodObject') {
    shape = def.shape?.() ?? def.shape;
  }
  if (!shape) return fields;

  for (const [name, fieldSchema] of Object.entries(shape)) {
    const fieldDef = (fieldSchema as any)._def;
    const isOptional = fieldDef?.typeName === 'ZodOptional';
    const innerDef = isOptional ? fieldDef.innerType?._def : fieldDef;
    const typeName = innerDef?.typeName ?? 'unknown';

    const typeMap: Record<string, string> = {
      ZodString: 'string',
      ZodNumber: 'number',
      ZodBoolean: 'boolean',
      ZodArray: 'array',
      ZodObject: 'object',
      ZodRecord: 'record',
      ZodEnum: 'enum',
    };

    fields.push({
      name,
      type: typeMap[typeName] ?? typeName.replace('Zod', '').toLowerCase(),
      required: !isOptional,
    });
  }

  return fields;
}

interface GroupedOperation {
  name: string;
  summary: string;
  fields: SchemaField[];
}

function buildOperationsData(
  domainFilter?: string,
  query?: string,
): Record<string, GroupedOperation[]> {
  const grouped: Record<string, GroupedOperation[]> = {};

  for (const [name, meta] of Object.entries(OPERATIONS)) {
    const domain = name.split('.')[0];

    if (domainFilter && domain !== domainFilter) continue;

    if (query) {
      const q = query.toLowerCase();
      const matches =
        name.toLowerCase().includes(q) ||
        meta.summary.toLowerCase().includes(q);
      if (!matches) continue;
    }

    const schema = OPERATION_SCHEMAS[name];
    const fields = schema ? extractSchemaFields(schema) : [];

    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push({ name, summary: meta.summary, fields });
  }

  return grouped;
}

function formatOperationsText(
  data: Record<string, GroupedOperation[]>,
): string {
  const lines: string[] = [];
  for (const [domain, ops] of Object.entries(data)) {
    lines.push(`## ${domain} (${ops.length} operations)`);
    for (const op of ops) {
      const required = op.fields
        .filter((f) => f.required)
        .map((f) => `${f.name}: ${f.type}`);
      const optional = op.fields
        .filter((f) => !f.required)
        .map((f) => `${f.name}?: ${f.type}`);
      const params = [...required, ...optional].join(', ');
      lines.push(`  ${op.name} — ${op.summary}`);
      if (params) lines.push(`    params: ${params}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── Helpers ──

function formatWebsetListText(
  websetsList: Record<string, unknown>[],
): string {
  if (websetsList.length === 0) return 'No websets found.';
  const lines = websetsList.map((w) => {
    const id = w.id ?? 'unknown';
    const title = w.title ?? 'Untitled';
    const status = w.status ?? 'unknown';
    const entity = w.entityType ?? '';
    return `- ${title} [${status}] ${entity ? `(${entity})` : ''} id:${id}`;
  });
  return `${websetsList.length} webset(s):\n${lines.join('\n')}`;
}

// ── Tool Registration ──

export function registerAppTools(
  server: McpServer,
  exa: Exa,
): void {
  registerAppResource(
    server,
    'Schwartz13 UI',
    RESOURCE_URI,
    { description: 'Interactive UI for Exa Websets operations' },
    async () => {
      const html = await fs.readFile(
        path.join(DIST_DIR, 'mcp-app.html'),
        'utf-8',
      );
      return {
        contents: [
          { uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  // ── 1. browse_collections ──

  registerAppTool(
    server,
    'browse_collections',
    {
      title: 'Browse Collections',
      description:
        'List all websets. Returns a table of collections with status, entity type, and item counts.',
      inputSchema: {
        maxItems: z.number().optional().describe(
          'Maximum websets to return (default 100)',
        ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ maxItems }) => {
      const result = await websets.getAll(
        { maxItems: maxItems ?? 100 },
        exa,
      );
      if (result.isError) {
        return { content: result.content, isError: true };
      }
      const parsed = JSON.parse(result.content[0].text);
      const text = formatWebsetListText(parsed.data ?? []);
      return {
        content: [{ type: 'text' as const, text }],
        structuredContent: { type: 'websets-list', data: parsed },
      };
    },
  );

  // ── 2. create_collection ──

  registerAppTool(
    server,
    'create_collection',
    {
      title: 'Create Collection',
      description:
        'Create a new webset collection. Accepts simplified params: criteria as string array, entityType as string.',
      inputSchema: {
        query: z.string().describe('Search query for finding entities'),
        entityType: z.string().optional().describe(
          'Entity type: company, person, article, research_paper, custom',
        ),
        count: z.number().optional().describe(
          'Target number of results (default 10)',
        ),
        criteria: z.array(z.string()).optional().describe(
          'Filter criteria as plain strings (converted to [{description}] format)',
        ),
        enrichments: z.array(z.object({
          description: z.string(),
          format: z.string().optional(),
          options: z.array(z.string()).optional(),
        })).optional().describe(
          'Enrichments to add. Options as plain strings (converted to [{label}] format)',
        ),
        name: z.string().optional().describe('Optional name for the webset'),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ query, entityType, count, criteria, enrichments: enrichList, name }) => {
      const args: Record<string, unknown> = {
        searchQuery: query,
        searchCount: count ?? 10,
      };
      if (name) args.name = name;
      if (entityType) args.entity = { type: entityType };
      if (criteria && criteria.length > 0) {
        args.searchCriteria = criteria.map((d) => ({ description: d }));
      }
      if (enrichList && enrichList.length > 0) {
        args.enrichments = enrichList.map((e) => {
          const mapped: Record<string, unknown> = {
            description: e.description,
          };
          if (e.format) mapped.format = e.format;
          if (e.options && e.options.length > 0) {
            mapped.options = e.options.map((l) => ({ label: l }));
          }
          return mapped;
        });
      }

      const result = await websets.create(args, exa);
      if (result.isError) {
        return { content: result.content, isError: true };
      }
      const parsed = JSON.parse(result.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'webset-dashboard', data: parsed },
      };
    },
  );

  // ── 3. view_collection ──

  registerAppTool(
    server,
    'view_collection',
    {
      title: 'View Collection',
      description:
        'View a webset dashboard with status, searches, enrichments, monitors, and item count.',
      inputSchema: {
        websetId: z.string().describe('The webset ID to view'),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ websetId }) => {
      const result = await websets.get(
        { id: websetId, expand: ['searches', 'enrichments', 'monitors', 'imports'] },
        exa,
      );
      if (result.isError) {
        return { content: result.content, isError: true };
      }
      const parsed = JSON.parse(result.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'webset-dashboard', data: parsed },
      };
    },
  );

  // ── 4. view_results ──

  registerAppTool(
    server,
    'view_results',
    {
      title: 'View Results',
      description:
        'View webset items in an interactive table with sorting and filtering.',
      inputSchema: {
        websetId: z.string().describe('The webset ID to fetch items from'),
        maxItems: z.number().optional().describe(
          'Maximum items to fetch (default 200)',
        ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ websetId, maxItems }) => {
      const result = await items.getAll(
        { websetId, maxItems: maxItems ?? 200 },
        exa,
      );
      if (result.isError) {
        return { content: result.content, isError: true };
      }
      const parsed = JSON.parse(result.content[0].text);
      return {
        content: result.content,
        structuredContent: {
          type: 'items-table',
          data: { ...parsed, websetId },
        },
      };
    },
  );

  // ── 5. add_search ──

  registerAppTool(
    server,
    'add_search',
    {
      title: 'Add Search',
      description:
        'Add a new search to an existing webset. Criteria as plain strings.',
      inputSchema: {
        websetId: z.string().describe('The webset ID to add a search to'),
        query: z.string().describe('Search query'),
        count: z.number().optional().describe('Target count (default 10)'),
        entityType: z.string().optional().describe('Entity type'),
        criteria: z.array(z.string()).optional().describe(
          'Criteria as plain strings',
        ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ websetId, query, count, entityType, criteria }) => {
      const args: Record<string, unknown> = { websetId, query };
      if (count) args.count = count;
      if (entityType) args.entity = { type: entityType };
      if (criteria && criteria.length > 0) {
        args.criteria = criteria.map((d) => ({ description: d }));
      }

      const result = await searches.create(args, exa);
      if (result.isError) {
        return { content: result.content, isError: true };
      }

      // Return updated webset dashboard
      const wsResult = await websets.get(
        { id: websetId, expand: ['searches', 'enrichments', 'monitors', 'imports'] },
        exa,
      );
      if (wsResult.isError) return { content: result.content };
      const parsed = JSON.parse(wsResult.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'webset-dashboard', data: parsed },
      };
    },
  );

  // ── 6. add_enrichment ──

  registerAppTool(
    server,
    'add_enrichment',
    {
      title: 'Add Enrichment',
      description:
        'Add an enrichment to an existing webset. Options as plain strings.',
      inputSchema: {
        websetId: z.string().describe('The webset ID'),
        description: z.string().describe('What to enrich'),
        format: z.enum([
          'text', 'date', 'number', 'options', 'email', 'phone', 'url',
        ]).optional().describe('Enrichment format'),
        options: z.array(z.string()).optional().describe(
          'Options as plain strings (required when format is "options")',
        ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ websetId, description, format, options }) => {
      const args: Record<string, unknown> = { websetId, description };
      if (format) args.format = format;
      if (options && options.length > 0) {
        args.options = options.map((l) => ({ label: l }));
      }

      const result = await enrichments.create(args, exa);
      if (result.isError) {
        return { content: result.content, isError: true };
      }

      // Return updated webset dashboard
      const wsResult = await websets.get(
        { id: websetId, expand: ['searches', 'enrichments', 'monitors', 'imports'] },
        exa,
      );
      if (wsResult.isError) return { content: result.content };
      const parsed = JSON.parse(wsResult.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'webset-dashboard', data: parsed },
      };
    },
  );

  // ── 7. set_monitor ──

  registerAppTool(
    server,
    'set_monitor',
    {
      title: 'Set Monitor',
      description:
        'Set up a monitor on a webset with a cron schedule.',
      inputSchema: {
        websetId: z.string().describe('The webset ID'),
        cron: z.string().describe(
          'Cron schedule (5-field: "minute hour day month weekday")',
        ),
        timezone: z.string().optional().describe(
          'Timezone (e.g. "America/New_York")',
        ),
        query: z.string().optional().describe('Override search query'),
        count: z.number().optional().describe('Override result count'),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ websetId, cron, timezone, query, count }) => {
      const args: Record<string, unknown> = { websetId, cron };
      if (timezone) args.timezone = timezone;
      if (query) args.query = query;
      if (count) args.count = count;

      const result = await monitors.create(args, exa);
      if (result.isError) {
        return { content: result.content, isError: true };
      }

      // Return updated webset dashboard
      const wsResult = await websets.get(
        { id: websetId, expand: ['searches', 'enrichments', 'monitors', 'imports'] },
        exa,
      );
      if (wsResult.isError) return { content: result.content };
      const parsed = JSON.parse(wsResult.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'webset-dashboard', data: parsed },
      };
    },
  );

  // ── 8. manage_collection ──

  registerAppTool(
    server,
    'manage_collection',
    {
      title: 'Manage Collection',
      description:
        'Cancel, delete, or update a webset collection.',
      inputSchema: {
        websetId: z.string().describe('The webset ID'),
        action: z.enum(['cancel', 'delete', 'update']).describe(
          'Action to perform',
        ),
        metadata: z.record(z.string()).optional().describe(
          'Metadata to set (for update action)',
        ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ websetId, action, metadata }) => {
      let result;
      switch (action) {
        case 'cancel':
          result = await websets.cancel({ id: websetId }, exa);
          break;
        case 'delete':
          result = await websets.del({ id: websetId }, exa);
          break;
        case 'update':
          result = await websets.update(
            { id: websetId, metadata },
            exa,
          );
          break;
      }

      if (result.isError) {
        return { content: result.content, isError: true };
      }

      if (action === 'delete') {
        // After delete, return the list view
        const listResult = await websets.getAll({ maxItems: 100 }, exa);
        if (!listResult.isError) {
          const parsed = JSON.parse(listResult.content[0].text);
          return {
            content: result.content,
            structuredContent: { type: 'websets-list', data: parsed },
          };
        }
        return { content: result.content };
      }

      // For cancel/update, return dashboard
      const parsed = JSON.parse(result.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'webset-dashboard', data: parsed },
      };
    },
  );

  // ── describe_operations (kept from original) ──

  registerAppTool(
    server,
    'describe_operations',
    {
      title: 'Describe Operations',
      description:
        'List all available manage_websets operations grouped by domain with parameter schemas.',
      inputSchema: {
        domain: z.string().optional().describe(
          'Filter to a specific domain (e.g. "websets", "items")',
        ),
        query: z.string().optional().describe(
          'Search operations by name or summary text',
        ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ domain, query }) => {
      const data = buildOperationsData(domain, query);
      const text = formatOperationsText(data);
      return {
        content: [{ type: 'text' as const, text }],
        structuredContent: { type: 'operations-guide', data },
      };
    },
  );

  // ── poll_items (app-internal, for UI refresh) ──

  registerAppTool(
    server,
    'poll_items',
    {
      title: 'Poll Items',
      description: 'Refresh item data for the UI.',
      inputSchema: {
        websetId: z.string().describe('The webset ID to poll items from'),
        maxItems: z.number().optional().describe('Maximum items to fetch'),
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI, visibility: ['app'] as any },
      },
    },
    async ({ websetId, maxItems }) => {
      const result = await items.getAll(
        { websetId, maxItems: maxItems ?? 200 },
        exa,
      );
      if (result.isError) {
        return { content: result.content, isError: true };
      }
      const parsed = JSON.parse(result.content[0].text);
      return {
        content: result.content,
        structuredContent: {
          type: 'items-table',
          data: { ...parsed, websetId },
        },
      };
    },
  );

  // ── poll_collection (app-internal, for dashboard refresh) ──

  registerAppTool(
    server,
    'poll_collection',
    {
      title: 'Poll Collection',
      description: 'Refresh webset dashboard data for the UI.',
      inputSchema: {
        websetId: z.string().describe('The webset ID to refresh'),
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI, visibility: ['app'] as any },
      },
    },
    async ({ websetId }) => {
      const result = await websets.get(
        { id: websetId, expand: ['searches', 'enrichments', 'monitors', 'imports'] },
        exa,
      );
      if (result.isError) {
        return { content: result.content, isError: true };
      }
      const parsed = JSON.parse(result.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'webset-dashboard', data: parsed },
      };
    },
  );

  // ── poll_collections (app-internal, for list refresh) ──

  registerAppTool(
    server,
    'poll_collections',
    {
      title: 'Poll Collections',
      description: 'Refresh websets list for the UI.',
      inputSchema: {
        maxItems: z.number().optional().describe('Max websets'),
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI, visibility: ['app'] as any },
      },
    },
    async ({ maxItems }) => {
      const result = await websets.getAll(
        { maxItems: maxItems ?? 100 },
        exa,
      );
      if (result.isError) {
        return { content: result.content, isError: true };
      }
      const parsed = JSON.parse(result.content[0].text);
      return {
        content: result.content,
        structuredContent: { type: 'websets-list', data: parsed },
      };
    },
  );
}
