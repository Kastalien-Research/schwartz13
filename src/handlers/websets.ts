import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult } from './types.js';

export const create: OperationHandler = async (args, exa) => {
  try {
    const params: Record<string, unknown> = {};

    if (args.name) params.name = args.name;
    if (args.description) params.description = args.description;
    if (args.externalId) params.externalId = args.externalId;
    if (args.metadata) params.metadata = args.metadata;

    if (args.searchQuery) {
      const search: Record<string, unknown> = {
        query: args.searchQuery,
        count: (args.searchCount as number) || 10,
      };
      if (args.searchCriteria) search.criteria = args.searchCriteria;
      if (args.entity) search.entity = args.entity;
      params.search = search;
    }

    if (args.enrichments && Array.isArray(args.enrichments) && args.enrichments.length > 0) {
      params.enrichments = args.enrichments;
    }

    const response = await exa.websets.create(params as any);
    return successResult(response);
  } catch (error) {
    return errorResult('websets.create', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const expand = args.expand as string[] | undefined;
    const response = await exa.websets.get(id, expand as any);
    return successResult(response);
  } catch (error) {
    return errorResult('websets.get', error);
  }
};

export const list: OperationHandler = async (args, exa) => {
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;

    const response = await exa.websets.list(opts as any);
    return successResult(response);
  } catch (error) {
    return errorResult('websets.list', error);
  }
};

export const update: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const response = await exa.websets.update(id, {
      metadata: args.metadata as Record<string, string> | undefined,
    });
    return successResult(response);
  } catch (error) {
    return errorResult('websets.update', error);
  }
};

export const del: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const response = await exa.websets.delete(id);
    return successResult(response);
  } catch (error) {
    return errorResult('websets.delete', error);
  }
};

export const cancel: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const response = await exa.websets.cancel(id);
    return successResult(response);
  } catch (error) {
    return errorResult('websets.cancel', error);
  }
};

export const waitUntilIdle: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const timeout = (args.timeout as number | undefined) ?? 300_000;
    const pollInterval = (args.pollInterval as number | undefined) ?? 1_000;
    const response = await exa.websets.waitUntilIdle(id, { timeout, pollInterval });
    return successResult(response);
  } catch (error) {
    return errorResult('websets.waitUntilIdle', error);
  }
};

export const getAll: OperationHandler = async (args, exa) => {
  try {
    const maxItems = (args.maxItems as number | undefined) ?? 100;
    const results: unknown[] = [];
    for await (const item of exa.websets.listAll()) {
      results.push(item);
      if (results.length >= maxItems) break;
    }
    return successResult({ data: results, count: results.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('websets.getAll', error);
  }
};

export const preview: OperationHandler = async (args, exa) => {
  try {
    const search: Record<string, unknown> = {
      query: args.query,
    };
    if (args.count) search.count = args.count;
    if (args.entity) search.entity = args.entity;

    const params = { search };
    const options = args.search !== undefined ? { search: args.search as boolean } : undefined;
    const response = await exa.websets.preview(params as any, options);
    return successResult(response);
  } catch (error) {
    return errorResult('websets.preview', error);
  }
};
