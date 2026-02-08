import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult, requireParams } from './types.js';
import { projectWebhook, projectWebhookAttempt } from '../lib/projections.js';

export const create: OperationHandler = async (args, exa) => {
  const guard = requireParams('webhooks.create', args, 'url', 'events');
  if (guard) return guard;
  try {
    const params: Record<string, unknown> = {
      url: args.url,
      events: args.events,
    };
    if (args.metadata) params.metadata = args.metadata;

    const response = await exa.websets.webhooks.create(params as any);
    return successResult(projectWebhook(response as unknown as Record<string, unknown>));
  } catch (error) {
    return errorResult('webhooks.create', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  const guard = requireParams('webhooks.get', args, 'id');
  if (guard) return guard;
  try {
    const response = await exa.websets.webhooks.get(args.id as string);
    return successResult(projectWebhook(response as unknown as Record<string, unknown>));
  } catch (error) {
    return errorResult('webhooks.get', error);
  }
};

export const list: OperationHandler = async (args, exa) => {
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;

    const response = await exa.websets.webhooks.list(opts as any);
    const raw = response as unknown as Record<string, unknown>;
    const data = raw.data as Record<string, unknown>[] | undefined;
    if (data) {
      return successResult({ ...raw, data: data.map(projectWebhook) });
    }
    return successResult(response);
  } catch (error) {
    return errorResult('webhooks.list', error);
  }
};

export const update: OperationHandler = async (args, exa) => {
  const guard = requireParams('webhooks.update', args, 'id');
  if (guard) return guard;
  try {
    const id = args.id as string;
    const params: Record<string, unknown> = {};
    if (args.url) params.url = args.url;
    if (args.events) params.events = args.events;
    if (args.metadata !== undefined) params.metadata = args.metadata;

    const response = await exa.websets.webhooks.update(id, params as any);
    return successResult(projectWebhook(response as unknown as Record<string, unknown>));
  } catch (error) {
    return errorResult('webhooks.update', error);
  }
};

export const del: OperationHandler = async (args, exa) => {
  const guard = requireParams('webhooks.delete', args, 'id');
  if (guard) return guard;
  try {
    const response = await exa.websets.webhooks.delete(args.id as string);
    return successResult(projectWebhook(response as unknown as Record<string, unknown>));
  } catch (error) {
    return errorResult('webhooks.delete', error);
  }
};

export const getAll: OperationHandler = async (args, exa) => {
  try {
    const maxItems = (args.maxItems as number | undefined) ?? 100;
    const results: unknown[] = [];
    for await (const item of exa.websets.webhooks.listAll()) {
      results.push(item);
      if (results.length >= maxItems) break;
    }
    const projected = results.map(r => projectWebhook(r as Record<string, unknown>));
    return successResult({ data: projected, count: projected.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('webhooks.getAll', error);
  }
};

export const getAllAttempts: OperationHandler = async (args, exa) => {
  const guard = requireParams('webhooks.getAllAttempts', args, 'id');
  if (guard) return guard;
  try {
    const id = args.id as string;
    const maxItems = (args.maxItems as number | undefined) ?? 500;
    const opts: Record<string, unknown> = {};
    if (args.eventType) opts.eventType = args.eventType;
    if (args.successful !== undefined) opts.successful = args.successful;
    const results: unknown[] = [];
    for await (const item of exa.websets.webhooks.listAllAttempts(id, opts as any)) {
      results.push(item);
      if (results.length >= maxItems) break;
    }
    const projected = results.map(r => projectWebhookAttempt(r as Record<string, unknown>));
    return successResult({ data: projected, count: projected.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('webhooks.getAllAttempts', error);
  }
};

export const listAttempts: OperationHandler = async (args, exa) => {
  const guard = requireParams('webhooks.list_attempts', args, 'id');
  if (guard) return guard;
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;
    if (args.eventType) opts.eventType = args.eventType;
    if (args.successful !== undefined) opts.successful = args.successful;

    const response = await exa.websets.webhooks.listAttempts(
      args.id as string,
      opts as any,
    );
    const raw = response as unknown as Record<string, unknown>;
    const data = raw.data as Record<string, unknown>[] | undefined;
    if (data) {
      return successResult({ ...raw, data: data.map(projectWebhookAttempt) });
    }
    return successResult(response);
  } catch (error) {
    return errorResult('webhooks.list_attempts', error);
  }
};
