// Express routes for receiving Exa webhooks and streaming events via SSE.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { verifyExaSignature } from './signature.js';
import { webhookEventBus, createEvent } from './eventBus.js';
import { listWebhookSecrets } from '../store/db.js';

export function createWebhookRouter(envSecret?: string): Router {
  const router = Router();

  // POST /webhooks/exa — receive Exa webhook events
  router.post('/webhooks/exa', (req: Request, res: Response) => {
    const sigHeader = req.headers['exa-signature'] as string | undefined;
    const rawBody = (req as any).__rawBody as Buffer | undefined;

    // Build the candidate secret set: optional env-var fallback + every
    // per-webhook secret captured at webhooks.create time. Exa's payload
    // doesn't carry a webhook id, so we try-each rather than look-up.
    const candidates: string[] = [];
    if (envSecret) candidates.push(envSecret);
    let storedRows: ReturnType<typeof listWebhookSecrets>;
    try {
      storedRows = listWebhookSecrets();
    } catch (err) {
      console.error('[webhooks/exa] failed to load stored webhook secrets:', err);
      storedRows = [];
    }
    for (const row of storedRows) candidates.push(row.secret);

    if (candidates.length === 0) {
      // No secrets known anywhere — accept unsigned. The boot-time warning in
      // index.ts already flags this case loudly. As soon as any webhook is
      // created via webhooks.create, this path stops being reachable and
      // signature verification becomes mandatory.
      const payload = req.body as Record<string, unknown>;
      const event = createEvent(payload);
      webhookEventBus.publish(event);
      res.status(200).json({ received: true, eventId: event.id });
      return;
    }

    if (!sigHeader || !rawBody) {
      res.status(401).json({ error: 'Missing signature' });
      return;
    }

    const verified = candidates.some((s) => verifyExaSignature(rawBody, sigHeader, s));
    if (!verified) {
      console.warn(
        `[webhooks/exa] Rejected request: signature did not match any of `
        + `${candidates.length} known secret(s).`,
      );
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    const event = createEvent(payload);
    webhookEventBus.publish(event);
    res.status(200).json({ received: true, eventId: event.id });
  });

  // GET /webhooks/events — SSE stream for channel bridges
  router.get('/webhooks/events', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send initial connection message
    res.write(': connected\n\n');

    // Subscribe to events
    const unsubscribe = webhookEventBus.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Keepalive every 30 seconds
    const keepalive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30_000);

    // Clean up on disconnect
    _req.on('close', () => {
      unsubscribe();
      clearInterval(keepalive);
    });
  });

  // GET /webhooks/status — health check for webhook system
  router.get('/webhooks/status', (_req: Request, res: Response) => {
    let storedCount = 0;
    try {
      storedCount = listWebhookSecrets().length;
    } catch {
      // Status endpoint stays best-effort; the load failure is logged on the POST path.
    }
    res.json({
      subscribers: webhookEventBus.subscriberCount,
      envSecretConfigured: !!envSecret,
      storedSecrets: storedCount,
      signatureVerification: !!envSecret || storedCount > 0,
    });
  });

  return router;
}
