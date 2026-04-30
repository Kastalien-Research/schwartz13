#!/usr/bin/env node
// End-to-end smoke test for the webhook receiver path.
//
// Boots the real server, plants a known per-webhook secret in SQLite the same
// way webhooks.create would, then fires three POSTs:
//   1. correctly signed     → expect 200
//   2. unsigned             → expect 401
//   3. wrong-secret signed  → expect 401
//
// All loud-failure logs surface in this script's stderr.

import { createServer as createHttpServer } from 'node:http';
import { createServer } from '../dist/server.js';
import { createExaSignature } from '../dist/webhooks/signature.js';
import { saveWebhookSecret, listWebhookSecrets, closeDb } from '../dist/store/db.js';
import { webhookEventBus } from '../dist/webhooks/eventBus.js';

const TEST_SECRET = 'test_secret_known_to_db';
const WRONG_SECRET = 'test_secret_NOT_known_to_db';
const PORT = 17861;

console.log('--- Boot ---');
delete process.env.EXA_WEBHOOK_SECRET; // env-var path off; only stored secret should match
const { app } = createServer({ exaApiKey: 'dummy' });
const server = createHttpServer(app);
await new Promise((r) => server.listen(PORT, r));

console.log('--- Plant secret in webhook_secrets table ---');
saveWebhookSecret('webhook_test_id', TEST_SECRET, 'http://test.local/webhooks/exa');
console.log('  stored secrets:', listWebhookSecrets().length);

const events = [];
const unsubscribe = webhookEventBus.subscribe((ev) => {
  events.push(ev.id);
  console.log('  bus published:', ev.id, ev.type);
});

const post = async (label, headers, body) => {
  const res = await fetch(`http://localhost:${PORT}/webhooks/exa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
  const text = await res.text();
  console.log(`  ${label}: HTTP ${res.status} ${text}`);
  return res.status;
};

const payload = JSON.stringify({
  id: 'evt_test_001',
  object: 'event',
  type: 'webset.item.created',
  data: { id: 'item_test', websetId: 'ws_test', properties: {} },
  createdAt: new Date().toISOString(),
});

console.log('\n--- 1. Correctly signed (stored secret) ---');
const goodSig = createExaSignature(payload, TEST_SECRET);
const s1 = await post('signed-correct', { 'exa-signature': goodSig }, payload);

console.log('\n--- 2. Unsigned (no header) ---');
const s2 = await post('unsigned', {}, payload);

console.log('\n--- 3. Wrong-secret signed ---');
const badSig = createExaSignature(payload, WRONG_SECRET);
const s3 = await post('signed-wrong', { 'exa-signature': badSig }, payload);

console.log('\n--- Result summary ---');
const expect = (label, got, want) => {
  const ok = got === want;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}: got ${got}, want ${want}`);
  return ok;
};
const allOk = [
  expect('correctly signed → 200', s1, 200),
  expect('unsigned → 401', s2, 401),
  expect('wrong-secret signed → 401', s3, 401),
  expect('exactly 1 event published to bus', events.length, 1),
].every(Boolean);

unsubscribe();
server.close();
closeDb();
process.exit(allOk ? 0 : 1);
