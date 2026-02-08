import { describe, it, expect, vi } from 'vitest';
import { create } from '../enrichments.js';
import type { Exa } from 'exa-js';

function mockExa(): Exa {
  return {
    websets: {
      enrichments: {
        create: vi.fn().mockResolvedValue({ id: 'enr_123', status: 'running' }),
      },
    },
  } as unknown as Exa;
}

describe('enrichments.create validation', () => {
  it('rejects options format without options array', async () => {
    const exa = mockExa();
    const result = await create(
      { websetId: 'ws_1', description: 'test', format: 'options' },
      exa,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('you must provide the options parameter');
  });

  it('rejects options format with empty options array', async () => {
    const exa = mockExa();
    const result = await create(
      { websetId: 'ws_1', description: 'test', format: 'options', options: [] },
      exa,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('you must provide the options parameter');
  });

  it('rejects more than 150 options', async () => {
    const exa = mockExa();
    const options = Array.from({ length: 151 }, (_, i) => ({ label: `opt${i}` }));
    const result = await create(
      { websetId: 'ws_1', description: 'test', format: 'options', options },
      exa,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Too many options: 151');
    expect(result.content[0].text).toContain('Maximum is 150');
  });

  it('accepts valid options format', async () => {
    const exa = mockExa();
    const result = await create(
      {
        websetId: 'ws_1',
        description: 'Company stage',
        format: 'options',
        options: [{ label: 'Seed' }, { label: 'Series A' }],
      },
      exa,
    );
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe('enr_123');
    expect(parsed.status).toBe('running');
  });

  it('accepts text format without options', async () => {
    const exa = mockExa();
    const result = await create(
      { websetId: 'ws_1', description: 'CEO name', format: 'text' },
      exa,
    );
    expect(result.isError).toBeUndefined();
  });
});
