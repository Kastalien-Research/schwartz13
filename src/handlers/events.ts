import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult } from './types.js';

export const list: OperationHandler = async (args, exa) => {
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;
    if (args.types) opts.types = args.types;

    const response = await exa.websets.events.list(opts as any);
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
    return successResult({ data: results, count: results.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('events.getAll', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.events.get(args.id as string);
    return successResult(response);
  } catch (error) {
    return errorResult('events.get', error);
  }
};
