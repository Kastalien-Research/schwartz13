import type { OperationHandler } from './types.js';
import { successResult, errorResult, requireParams } from './types.js';

const SEARCH_HINTS = `Common issues:
- type must be one of: neural, keyword, auto, hybrid, fast, deep
- category must be: company, research paper, news, pdf, tweet, personal site, financial report, people
- contents is an object like {text: true, summary: true}, NOT a boolean
- Date filters use ISO 8601: "2024-01-01T00:00:00.000Z"
- additionalQueries only works when type is "deep" (max 5)`;

export const search: OperationHandler = async (args, exa) => {
  const guard = requireParams('exa.search', args, 'query');
  if (guard) return guard;
  try {
    const opts: Record<string, unknown> = {};
    if (args.type) opts.type = args.type;
    if (args.numResults) opts.numResults = args.numResults;
    if (args.category) opts.category = args.category;
    if (args.includeDomains) opts.includeDomains = args.includeDomains;
    if (args.excludeDomains) opts.excludeDomains = args.excludeDomains;
    if (args.startCrawlDate) opts.startCrawlDate = args.startCrawlDate;
    if (args.endCrawlDate) opts.endCrawlDate = args.endCrawlDate;
    if (args.startPublishedDate) opts.startPublishedDate = args.startPublishedDate;
    if (args.endPublishedDate) opts.endPublishedDate = args.endPublishedDate;
    if (args.contents) opts.contents = args.contents;
    if (args.includeText) opts.includeText = args.includeText;
    if (args.excludeText) opts.excludeText = args.excludeText;
    if (args.additionalQueries) opts.additionalQueries = args.additionalQueries;
    if (args.userLocation) opts.userLocation = args.userLocation;
    if (args.moderation !== undefined) opts.moderation = args.moderation;
    if (args.useAutoprompt !== undefined) opts.useAutoprompt = args.useAutoprompt;
    const hasOpts = Object.keys(opts).length > 0;
    const response = await exa.search(args.query as string, hasOpts ? opts as any : undefined);
    return successResult(response);
  } catch (error) {
    return errorResult('exa.search', error, SEARCH_HINTS);
  }
};

export const findSimilar: OperationHandler = async (args, exa) => {
  const guard = requireParams('exa.findSimilar', args, 'url');
  if (guard) return guard;
  try {
    const opts: Record<string, unknown> = {};
    if (args.numResults) opts.numResults = args.numResults;
    if (args.excludeSourceDomain !== undefined) opts.excludeSourceDomain = args.excludeSourceDomain;
    if (args.includeDomains) opts.includeDomains = args.includeDomains;
    if (args.excludeDomains) opts.excludeDomains = args.excludeDomains;
    if (args.startCrawlDate) opts.startCrawlDate = args.startCrawlDate;
    if (args.endCrawlDate) opts.endCrawlDate = args.endCrawlDate;
    if (args.startPublishedDate) opts.startPublishedDate = args.startPublishedDate;
    if (args.endPublishedDate) opts.endPublishedDate = args.endPublishedDate;
    if (args.contents) opts.contents = args.contents;
    if (args.includeText) opts.includeText = args.includeText;
    if (args.excludeText) opts.excludeText = args.excludeText;
    if (args.category) opts.category = args.category;
    if (args.userLocation) opts.userLocation = args.userLocation;
    const hasOpts = Object.keys(opts).length > 0;
    const response = await exa.findSimilar(args.url as string, hasOpts ? opts as any : undefined);
    return successResult(response);
  } catch (error) {
    return errorResult('exa.findSimilar', error);
  }
};

export const getContents: OperationHandler = async (args, exa) => {
  const guard = requireParams('exa.getContents', args, 'urls');
  if (guard) return guard;
  try {
    const urls = args.urls as string | string[];
    const opts: Record<string, unknown> = {};
    if (args.text !== undefined) opts.text = args.text;
    if (args.highlights !== undefined) opts.highlights = args.highlights;
    if (args.summary) opts.summary = args.summary;
    if (args.livecrawl) opts.livecrawl = args.livecrawl;
    if (args.livecrawlTimeout) opts.livecrawlTimeout = args.livecrawlTimeout;
    if (args.maxAgeHours) opts.maxAgeHours = args.maxAgeHours;
    if (args.subpages) opts.subpages = args.subpages;
    if (args.subpageTarget) opts.subpageTarget = args.subpageTarget;
    if (args.extras) opts.extras = args.extras;
    if (args.context !== undefined) opts.context = args.context;
    const hasOpts = Object.keys(opts).length > 0;
    const response = await exa.getContents(urls, hasOpts ? opts as any : undefined);
    return successResult(response);
  } catch (error) {
    return errorResult('exa.getContents', error);
  }
};

export const answer: OperationHandler = async (args, exa) => {
  const guard = requireParams('exa.answer', args, 'query');
  if (guard) return guard;
  try {
    const opts: Record<string, unknown> = {};
    if (args.text !== undefined) opts.text = args.text;
    if (args.model) opts.model = args.model;
    if (args.systemPrompt) opts.systemPrompt = args.systemPrompt;
    if (args.outputSchema) opts.outputSchema = args.outputSchema;
    if (args.userLocation) opts.userLocation = args.userLocation;
    const hasOpts = Object.keys(opts).length > 0;
    const response = await exa.answer(args.query as string, hasOpts ? opts as any : undefined);
    return successResult(response);
  } catch (error) {
    return errorResult('exa.answer', error);
  }
};
