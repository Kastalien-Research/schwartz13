import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult } from './types.js';

export const create: OperationHandler = async (args, exa) => {
  try {
    const params: Record<string, unknown> = {
      format: args.format,
      entity: args.entity,
      count: args.count,
      size: args.size,
    };
    if (args.title) params.title = args.title;
    if (args.csv) params.csv = args.csv;
    if (args.metadata) params.metadata = args.metadata;

    const response = await exa.websets.imports.create(params as any);
    return successResult(response);
  } catch (error) {
    return errorResult('imports.create', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.imports.get(args.id as string);
    return successResult(response);
  } catch (error) {
    return errorResult('imports.get', error);
  }
};

export const list: OperationHandler = async (args, exa) => {
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;

    const response = await exa.websets.imports.list(opts as any);
    return successResult(response);
  } catch (error) {
    return errorResult('imports.list', error);
  }
};

export const update: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const params: Record<string, unknown> = {};
    if (args.metadata !== undefined) params.metadata = args.metadata;
    if (args.title) params.title = args.title;

    const response = await exa.websets.imports.update(id, params as any);
    return successResult(response);
  } catch (error) {
    return errorResult('imports.update', error);
  }
};

export const waitUntilCompleted: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const timeout = (args.timeout as number | undefined) ?? 300_000;
    const pollInterval = (args.pollInterval as number | undefined) ?? 2_000;
    const response = await exa.websets.imports.waitUntilCompleted(id, { timeout, pollInterval });
    return successResult(response);
  } catch (error) {
    return errorResult('imports.waitUntilCompleted', error);
  }
};

export const getAll: OperationHandler = async (args, exa) => {
  try {
    const maxItems = (args.maxItems as number | undefined) ?? 100;
    const results: unknown[] = [];
    for await (const item of exa.websets.imports.listAll()) {
      results.push(item);
      if (results.length >= maxItems) break;
    }
    return successResult({ data: results, count: results.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('imports.getAll', error);
  }
};

export const del: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.imports.delete(args.id as string);
    return successResult(response);
  } catch (error) {
    return errorResult('imports.delete', error);
  }
};
