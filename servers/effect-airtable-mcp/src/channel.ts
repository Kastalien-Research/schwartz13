/**
 * One-way Airtable channel for Claude Code.
 *
 * Pushes notifications into a Claude Code session when Airtable records
 * change. Uses the Airtable Webhooks API to watch bases, then fetches
 * payloads on each ping and forwards them as channel notifications.
 *
 * Start with:  node build/channel.js
 * Or via npm:  npm run channel
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import axios, { type AxiosInstance } from "axios";

// --- Config ---

const CHANNEL_PORT = parseInt(process.env.CHANNEL_PORT ?? "3002", 10);
const CHANNEL_HOST = process.env.CHANNEL_HOST ?? "127.0.0.1";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const WEBHOOK_URL = process.env.AIRTABLE_WEBHOOK_URL; // Public URL that Airtable can reach
const WATCH_BASES = (process.env.AIRTABLE_WATCH_BASES ?? "").split(",").filter(Boolean);

// Cursor tracking per webhook — ensures we only fetch new payloads
const cursors: Record<string, number> = {};

// --- Airtable API client ---

function createClient(): AxiosInstance {
  if (!AIRTABLE_API_KEY) {
    console.error("AIRTABLE_API_KEY is required for the channel.");
    process.exit(1);
  }
  return axios.create({
    baseURL: "https://api.airtable.com/v0",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
}

// --- Webhook management ---

interface WebhookRegistration {
  id: string;
  baseId: string;
  expirationTime: string;
}

const registeredWebhooks: WebhookRegistration[] = [];

async function registerWebhook(
  client: AxiosInstance,
  baseId: string,
  notificationUrl: string
): Promise<WebhookRegistration | null> {
  try {
    const res = await client.post(`/bases/${baseId}/webhooks`, {
      notificationUrl,
      specification: {
        options: {
          filters: {
            dataTypes: ["tableData"],
            recordChangeScope: baseId,
          },
        },
      },
    });
    const wh: WebhookRegistration = {
      id: res.data.id,
      baseId,
      expirationTime: res.data.expirationTime,
    };
    // Initialize cursor to 1 (start of payloads)
    cursors[wh.id] = res.data.cursor ?? 1;
    console.error(`Registered webhook ${wh.id} for base ${baseId} (expires ${wh.expirationTime})`);
    return wh;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to register webhook for base ${baseId}: ${msg}`);
    return null;
  }
}

async function refreshWebhook(client: AxiosInstance, wh: WebhookRegistration): Promise<void> {
  try {
    const res = await client.post(`/bases/${wh.baseId}/webhooks/${wh.id}/refresh`);
    wh.expirationTime = res.data.expirationTime;
    console.error(`Refreshed webhook ${wh.id} (new expiry ${wh.expirationTime})`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to refresh webhook ${wh.id}: ${msg}`);
  }
}

async function fetchPayloads(
  client: AxiosInstance,
  wh: WebhookRegistration
): Promise<Array<Record<string, unknown>>> {
  const payloads: Array<Record<string, unknown>> = [];
  let cursor = cursors[wh.id] ?? 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const res = await client.get(
        `/bases/${wh.baseId}/webhooks/${wh.id}/payloads`,
        { params: { cursor } }
      );
      const data = res.data;
      if (data.payloads && data.payloads.length > 0) {
        payloads.push(...data.payloads);
      }
      cursor = data.cursor ?? cursor;
      hasMore = data.mightHaveMore ?? false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error fetching payloads for webhook ${wh.id}: ${msg}`);
      hasMore = false;
    }
  }

  cursors[wh.id] = cursor;
  return payloads;
}

// --- Payload formatting ---

function formatPayload(baseId: string, payload: Record<string, unknown>): {
  content: string;
  meta: Record<string, string>;
} {
  const actionMeta = payload.actionMetadata as Record<string, unknown> | undefined;
  const changedTablesById = payload.changedTablesById as Record<string, unknown> | undefined;

  const tableIds = changedTablesById ? Object.keys(changedTablesById) : [];
  const changeTypes: string[] = [];

  for (const tableId of tableIds) {
    const tableChanges = changedTablesById![tableId] as Record<string, unknown>;
    if (tableChanges.createdRecordsById) changeTypes.push("record_created");
    if (tableChanges.changedRecordsById) changeTypes.push("record_updated");
    if (tableChanges.destroyedRecordIds) changeTypes.push("record_deleted");
    if (tableChanges.changedFieldsById) changeTypes.push("field_changed");
    if (tableChanges.createdFieldsById) changeTypes.push("field_created");
    if (tableChanges.destroyedFieldIds) changeTypes.push("field_deleted");
  }

  const uniqueTypes = [...new Set(changeTypes)];

  return {
    content: JSON.stringify(
      {
        base_id: baseId,
        tables_changed: tableIds,
        change_types: uniqueTypes,
        source: actionMeta?.source ?? "unknown",
        source_metadata: actionMeta?.sourceMetadata ?? null,
        details: changedTablesById,
        timestamp: payload.timestamp,
      },
      null,
      2
    ),
    meta: {
      event_type: uniqueTypes.join(",") || "table_change",
      base_id: baseId,
      tables: tableIds.join(","),
      source: String(actionMeta?.source ?? "unknown"),
    },
  };
}

// --- Channel startup ---

export function startChannel(): void {
  const client = createClient();

  const mcp = new Server(
    { name: "airtable-channel", version: "0.1.0" },
    {
      capabilities: {
        experimental: {
          "claude/channel": {},
        },
      },
      instructions:
        "Airtable change notifications arrive as <channel> events with attributes: " +
        "event_type (record_created, record_updated, record_deleted, field_created, field_changed, field_deleted), " +
        "base_id, tables (comma-separated table IDs), source (client, publicApi, automation, system, sync, anonymousUser). " +
        "The body contains the full change payload including created/changed/destroyed records and fields. " +
        "Use the Airtable Code Mode server (search + execute tools) to inspect or act on the changes.",
    }
  );

  // -- Webhook listener --

  const app = express();
  app.use(express.json());

  app.post("/webhook", async (req, res) => {
    // Airtable sends a ping with { base: { id }, webhook: { id }, timestamp }
    const body = req.body;
    const webhookId = body?.webhook?.id as string | undefined;
    const baseId = body?.base?.id as string | undefined;

    if (!webhookId || !baseId) {
      res.sendStatus(200);
      return;
    }

    // Find or auto-register the webhook
    let wh = registeredWebhooks.find((w) => w.id === webhookId);
    if (!wh) {
      // Auto-register webhooks we receive pings for (e.g. manually created)
      wh = { id: webhookId, baseId, expirationTime: "unknown" };
      registeredWebhooks.push(wh);
      cursors[webhookId] = 1;
      console.error(`Auto-registered webhook ${webhookId} for base ${baseId}`);
    }

    try {
      const payloads = await fetchPayloads(client, wh);

      for (const payload of payloads) {
        const { content, meta } = formatPayload(baseId, payload);
        await mcp.notification({
          method: "notifications/claude/channel",
          params: { content, meta },
        });
      }
    } catch (err) {
      console.error("Error processing webhook ping:", err);
    }

    res.sendStatus(200);
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      webhooks: registeredWebhooks.map((w) => ({
        id: w.id,
        baseId: w.baseId,
        expires: w.expirationTime,
      })),
      cursors,
    });
  });

  app.listen(CHANNEL_PORT, CHANNEL_HOST, () => {
    console.error(
      `Airtable channel webhook listener on http://${CHANNEL_HOST}:${CHANNEL_PORT}/webhook`
    );
  });

  // -- Register webhooks for watched bases on startup --

  if (WEBHOOK_URL && WATCH_BASES.length > 0) {
    Promise.all(
      WATCH_BASES.map(async (baseId) => {
        const wh = await registerWebhook(client, baseId.trim(), `${WEBHOOK_URL}/webhook`);
        if (wh) registeredWebhooks.push(wh);
      })
    ).then(() => {
      console.error(
        `Registered ${registeredWebhooks.length}/${WATCH_BASES.length} webhooks`
      );
    });

    // Refresh webhooks every 6 days (they expire after 7)
    setInterval(
      () => {
        for (const wh of registeredWebhooks) {
          refreshWebhook(client, wh);
        }
      },
      6 * 24 * 60 * 60 * 1000
    );
  } else {
    console.error(
      "AIRTABLE_WEBHOOK_URL and/or AIRTABLE_WATCH_BASES not set — channel will listen but won't register webhooks automatically. " +
        "Use the Airtable API to register webhooks manually pointing at " +
        `http://${CHANNEL_HOST}:${CHANNEL_PORT}/webhook`
    );
  }

  // -- Stdio transport --

  const transport = new StdioServerTransport();
  mcp.connect(transport).then(() => {
    console.error("Airtable channel connected via stdio");
  });
}

// Direct execution support
const isMain = process.argv[1]?.endsWith("channel.js") || process.argv.includes("--channel");
if (isMain) {
  startChannel();
}
