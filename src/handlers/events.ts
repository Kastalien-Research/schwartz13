import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult, requireParams } from './types.js';
import { projectEvent } from '../lib/projections.js';

export const list: OperationHandler = async (args, exa) => {
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;
    if (args.types) opts.types = args.types;

    const response = await exa.websets.events.list(opts as any);
    const raw = response as unknown as Record<string, unknown>;
    const data = raw.data as Record<string, unknown>[] | undefined;
    if (data) {
      return successResult({ ...raw, data: data.map(projectEvent) });
    }
    return successResult(response);
  } catch (error) {
    return errorResult('events.list', error);
  }
};

export const getAll: OperationHandler = async (args, exa) => {
  try {
    const maxItems = (args.maxItems as number | undefined) ?? 1000;
    const opts: Record<string, unknown> = {};
    if (args.types) opts.types = args.types;
    const results: unknown[] = [];
    for await (const item of exa.websets.events.listAll(opts as any)) {
      results.push(item);
      if (results.length >= maxItems) break;
    }
    const projected = results.map(r => projectEvent(r as Record<string, unknown>));
    return successResult({ data: projected, count: projected.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('events.getAll', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  const guard = requireParams('events.get', args, 'id');
  if (guard) return guard;
  try {
    const response = await exa.websets.events.get(args.id as string);
    return successResult(projectEvent(response as unknown as Record<string, unknown>));
  } catch (error) {
    return errorResult('events.get', error);
  }
};
