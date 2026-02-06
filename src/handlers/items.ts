import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult } from './types.js';

export const list: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.items.list(args.websetId as string, {
      limit: args.limit as number | undefined,
      cursor: args.cursor as string | undefined,
    });
    return successResult(response);
  } catch (error) {
    return errorResult('items.list', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.items.get(
      args.websetId as string,
      args.itemId as string,
    );
    return successResult(response);
  } catch (error) {
    return errorResult('items.get', error);
  }
};

export const getAll: OperationHandler = async (args, exa) => {
  try {
    const websetId = args.websetId as string;
    const maxItems = (args.maxItems as number | undefined) ?? 1000;
    const opts: Record<string, unknown> = {};
    if (args.sourceId) opts.sourceId = args.sourceId;
    const results: unknown[] = [];
    for await (const item of exa.websets.items.listAll(websetId, opts as any)) {
      results.push(item);
      if (results.length >= maxItems) break;
    }
    return successResult({ data: results, count: results.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('items.getAll', error);
  }
};

export const del: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.items.delete(
      args.websetId as string,
      args.itemId as string,
    );
    return successResult(response);
  } catch (error) {
    return errorResult('items.delete', error);
  }
};
