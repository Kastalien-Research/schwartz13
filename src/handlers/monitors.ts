import type { Exa } from 'exa-js';
import { OperationHandler, successResult, errorResult } from './types.js';

export const create: OperationHandler = async (args, exa) => {
  try {
    const cron = args.cron as string;
    const count = args.count as number | undefined;

    // Application-level validation: count must be >= 1
    if (count !== undefined && count < 1) {
      return {
        content: [{
          type: 'text' as const,
          text: `Invalid count: ${count}. Must be at least 1.`,
        }],
        isError: true,
      };
    }

    // Application-level validation: cron must have exactly 5 fields
    const cronFields = cron.trim().split(/\s+/);
    if (cronFields.length !== 5) {
      return {
        content: [{
          type: 'text' as const,
          text: `Invalid cron expression: "${cron}". Must have exactly 5 fields (minute hour day month weekday). Examples: "0 9 * * 1" (every Monday at 9am), "0 0 * * *" (daily at midnight)`,
        }],
        isError: true,
      };
    }

    const cadence: Record<string, unknown> = { cron };
    if (args.timezone) cadence.timezone = args.timezone;

    const config: Record<string, unknown> = {};
    if (args.query) config.query = args.query;
    if (args.criteria) config.criteria = args.criteria;
    if (args.entity) config.entity = args.entity;
    if (count) config.count = count;
    if (args.behavior) config.behavior = args.behavior;

    const params: Record<string, unknown> = {
      websetId: args.websetId,
      cadence,
      behavior: { type: 'search', config },
    };
    if (args.metadata) params.metadata = args.metadata;

    const response = await exa.websets.monitors.create(params as any);
    return successResult(response);
  } catch (error) {
    return errorResult('monitors.create', error);
  }
};

export const get: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.monitors.get(args.id as string);
    return successResult(response);
  } catch (error) {
    return errorResult('monitors.get', error);
  }
};

export const list: OperationHandler = async (args, exa) => {
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;
    if (args.websetId) opts.websetId = args.websetId;

    const response = await exa.websets.monitors.list(opts as any);
    return successResult(response);
  } catch (error) {
    return errorResult('monitors.list', error);
  }
};

export const update: OperationHandler = async (args, exa) => {
  try {
    const id = args.id as string;
    const params: Record<string, unknown> = {};
    if (args.cadence) params.cadence = args.cadence;
    if (args.behavior) params.behavior = args.behavior;
    if (args.metadata !== undefined) params.metadata = args.metadata;
    if (args.status) params.status = args.status;

    const response = await exa.websets.monitors.update(id, params as any);
    return successResult(response);
  } catch (error) {
    return errorResult('monitors.update', error);
  }
};

export const del: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.monitors.delete(args.id as string);
    return successResult(response);
  } catch (error) {
    return errorResult('monitors.delete', error);
  }
};

export const getAll: OperationHandler = async (args, exa) => {
  try {
    const maxItems = (args.maxItems as number | undefined) ?? 100;
    const opts: Record<string, unknown> = {};
    if (args.websetId) opts.websetId = args.websetId;
    const results: unknown[] = [];
    for await (const item of exa.websets.monitors.listAll(opts as any)) {
      results.push(item);
      if (results.length >= maxItems) break;
    }
    return successResult({ data: results, count: results.length, truncated: results.length >= maxItems });
  } catch (error) {
    return errorResult('monitors.getAll', error);
  }
};

export const runsList: OperationHandler = async (args, exa) => {
  try {
    const opts: Record<string, unknown> = {};
    if (args.limit) opts.limit = args.limit;
    if (args.cursor) opts.cursor = args.cursor;

    const response = await exa.websets.monitors.runs.list(
      args.monitorId as string,
      opts as any,
    );
    return successResult(response);
  } catch (error) {
    return errorResult('monitors.runs.list', error);
  }
};

export const runsGet: OperationHandler = async (args, exa) => {
  try {
    const response = await exa.websets.monitors.runs.get(
      args.monitorId as string,
      args.runId as string,
    );
    return successResult(response);
  } catch (error) {
    return errorResult('monitors.runs.get', error);
  }
};
