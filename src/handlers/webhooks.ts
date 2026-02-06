import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult } from './types.js';

export const create: OperationHandler = async (args, exa) => {
  try {
    const params: Record<string, unknown> = {
      url: args.url,
      events: args.events,
    };
    if (args.metadata) params.metadata = args.metadata;

    const response = await exa.websets.webhooks.create(params as any);
    return successResult(response);
  } catch (error) {
    return errorResult('webhooks.create', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.webhooks.get(args.id as string);
    return successResult(response);
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
    return successResult(response);
  } catch (error) {
    return errorResult('webhooks.list', error);
  }
};

export const update: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const params: Record<string, unknown> = {};
    if (args.url) params.url = args.url;
    if (args.events) params.events = args.events;
    if (args.metadata !== undefined) params.metadata = args.metadata;

    const response = await exa.websets.webhooks.update(id, params as any);
    return successResult(response);
  } catch (error) {
    return errorResult('webhooks.update', error);
  }
};

export const del: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.webhooks.delete(args.id as string);
    return successResult(response);
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
    return successResult({ data: results, count: results.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('webhooks.getAll', error);
  }
};

export const getAllAttempts: OperationHandler = async (args, exa) => {
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
    return successResult({ data: results, count: results.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('webhooks.getAllAttempts', error);
  }
};

export const listAttempts: OperationHandler = async (args, exa) => {
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
    return successResult(response);
  } catch (error) {
    return errorResult('webhooks.list_attempts', error);
  }
};
