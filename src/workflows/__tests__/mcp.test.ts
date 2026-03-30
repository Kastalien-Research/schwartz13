import { describe, it, expect, beforeEach } from 'vitest';
import { workflowMetadata, workflowRegistry } from '../types.js';

// Force workflow side-effect registrations
import '../index.js';

// Lazy imports — resolved after we write mcp.ts
let renderWorkflowResource: (key: string, meta: any) => string;
let renderIndexResource: () => string;
let registerWorkflowMcp: (server: any) => void;

beforeEach(async () => {
  const mod = await import('../mcp.js');
  renderWorkflowResource = mod.renderWorkflowResource;
  renderIndexResource = mod.renderIndexResource;
  registerWorkflowMcp = mod.registerWorkflowMcp;
});

describe('workflowMetadata registry', () => {
  it('every non-echo workflow has metadata registered', () => {
    const workflowKeys = [...workflowRegistry.keys()].filter(k => k !== 'echo');
    expect(workflowKeys.length).toBeGreaterThanOrEqual(11);
    for (const key of workflowKeys) {
      expect(workflowMetadata.has(key), `missing metadata for workflow: ${key}`).toBe(true);
    }
  });

  it('echo workflow does NOT have metadata', () => {
    expect(workflowMetadata.has('echo')).toBe(false);
  });

  it('all metadata has required fields', () => {
    for (const [key, meta] of workflowMetadata) {
      expect(meta.title, `${key}.title`).toBeTruthy();
      expect(meta.description, `${key}.description`).toBeTruthy();
      expect(meta.category, `${key}.category`).toBeTruthy();
      expect(meta.parameters.length, `${key}.parameters`).toBeGreaterThan(0);
      expect(meta.steps.length, `${key}.steps`).toBeGreaterThan(0);
      expect(meta.output, `${key}.output`).toBeTruthy();
      expect(meta.example, `${key}.example`).toContain('callOperation');
      expect(meta.tags.length, `${key}.tags`).toBeGreaterThan(0);
    }
  });
});

describe('renderWorkflowResource', () => {
  it('includes all required Markdown sections', () => {
    const meta = workflowMetadata.get('qd.winnow')!;
    const md = renderWorkflowResource('qd.winnow', meta);

    expect(md).toContain('# Quality-Diversity Winnow (qd.winnow)');
    expect(md).toContain('## Quick Start');
    expect(md).toContain('```javascript');
    expect(md).toContain('## Parameters');
    expect(md).toContain('| Name | Type | Required | Description |');
    expect(md).toContain('## How It Works');
    expect(md).toContain('## Output');
    expect(md).toContain('**Category:** analysis');
  });

  it('includes related workflows when present', () => {
    const meta = workflowMetadata.get('qd.winnow')!;
    const md = renderWorkflowResource('qd.winnow', meta);
    expect(md).toContain('## Related Workflows');
    expect(md).toContain('lifecycle.harvest');
  });

  it('includes parameter defaults and constraints', () => {
    const meta = workflowMetadata.get('qd.winnow')!;
    const md = renderWorkflowResource('qd.winnow', meta);
    // Should show 'no' for optional params with defaults
    expect(md).toMatch(/count\s*\|/);
  });

  it('renders numbered steps', () => {
    const meta = workflowMetadata.get('lifecycle.harvest')!;
    const md = renderWorkflowResource('lifecycle.harvest', meta);
    expect(md).toMatch(/1\.\s/);
    expect(md).toMatch(/2\.\s/);
  });
});

describe('renderIndexResource', () => {
  it('includes all category headings', () => {
    const md = renderIndexResource();
    expect(md).toContain('## Retrieval');
    expect(md).toContain('## Research');
    expect(md).toContain('## Analysis');
    expect(md).toContain('## Monitoring');
    expect(md).toContain('## Verification');
    expect(md).toContain('## Lifecycle');
  });

  it('lists all annotated workflows', () => {
    const md = renderIndexResource();
    for (const key of workflowMetadata.keys()) {
      expect(md, `index should contain ${key}`).toContain(`**${key}**`);
    }
  });

  it('starts with a title', () => {
    const md = renderIndexResource();
    expect(md).toMatch(/^# Websets Workflows/);
  });
});

describe('registerWorkflowMcp', () => {
  it('registers expected number of resources and prompts', () => {
    const resources: Array<{ name: string; uri: string }> = [];
    const prompts: Array<{ name: string }> = [];

    const mockServer = {
      resource: (name: string, uri: string, _metaOrCb: any, _cb?: any) => {
        resources.push({ name, uri });
      },
      prompt: (name: string, ..._args: any[]) => {
        prompts.push({ name });
      },
    };

    registerWorkflowMcp(mockServer as any);

    // 11 workflow resources + 1 index = 12
    const expectedResourceCount = workflowMetadata.size + 1;
    expect(resources).toHaveLength(expectedResourceCount);

    // 11 workflow prompts + 1 choose = 12
    const expectedPromptCount = workflowMetadata.size + 1;
    expect(prompts).toHaveLength(expectedPromptCount);
  });

  it('registers the index resource', () => {
    const resourceUris: string[] = [];
    const mockServer = {
      resource: (_name: string, uri: string, _m: any, _c?: any) => {
        resourceUris.push(uri);
      },
      prompt: () => {},
    };

    registerWorkflowMcp(mockServer as any);
    expect(resourceUris).toContain('workflow://index');
  });

  it('registers the choose prompt', () => {
    const promptNames: string[] = [];
    const mockServer = {
      resource: () => {},
      prompt: (name: string, ..._args: any[]) => {
        promptNames.push(name);
      },
    };

    registerWorkflowMcp(mockServer as any);
    expect(promptNames).toContain('workflow/choose');
  });

  it('registers per-workflow resources at workflow:// URIs', () => {
    const resourceUris: string[] = [];
    const mockServer = {
      resource: (_name: string, uri: string, _m: any, _c?: any) => {
        resourceUris.push(uri);
      },
      prompt: () => {},
    };

    registerWorkflowMcp(mockServer as any);
    for (const key of workflowMetadata.keys()) {
      expect(resourceUris, `missing resource for ${key}`).toContain(`workflow://${key}`);
    }
  });

  it('registers per-workflow prompts', () => {
    const promptNames: string[] = [];
    const mockServer = {
      resource: () => {},
      prompt: (name: string, ..._args: any[]) => {
        promptNames.push(name);
      },
    };

    registerWorkflowMcp(mockServer as any);
    for (const key of workflowMetadata.keys()) {
      expect(promptNames, `missing prompt for ${key}`).toContain(`workflow/${key}`);
    }
  });
});

describe('catalog integration', () => {
  it('uses real descriptions for annotated workflows', async () => {
    // Reset catalog cache then rebuild
    const { resetCatalog, searchCatalog } = await import('../../tools/catalog.js');
    resetCatalog();

    const result = searchCatalog('quality diversity winnow', { detail: 'brief', limit: 5 });
    const names = result.results.map((r: any) => r.name);
    expect(names).toContain('workflow.qd.winnow');

    // The summary should NOT be the thin stub
    const entry = result.results.find((r: any) => r.name === 'workflow.qd.winnow');
    expect(entry?.summary).not.toContain('Background workflow');
    expect(entry?.summary).toContain('niche');
  });
});
