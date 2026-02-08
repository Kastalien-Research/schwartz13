import { describe, it, expect, vi } from 'vitest';
import { create } from '../monitors.js';
import type { Exa } from 'exa-js';

function mockExa(): Exa {
  return {
    websets: {
      monitors: {
        create: vi.fn().mockResolvedValue({ id: 'mon_123', status: 'enabled' }),
      },
    },
  } as unknown as Exa;
}

describe('monitors.create validation', () => {
  it('rejects cron with fewer than 5 fields', async () => {
    const exa = mockExa();
    const result = await create(
      { websetId: 'ws_1', cron: '0 9 *' },
      exa,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Must have exactly 5 fields');
    expect(result.content[0].text).toContain('Invalid cron expression');
  });

  it('rejects cron with more than 5 fields', async () => {
    const exa = mockExa();
    const result = await create(
      { websetId: 'ws_1', cron: '0 9 * * 1 2026' },
      exa,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Must have exactly 5 fields');
  });

  it('rejects count less than 1', async () => {
    const exa = mockExa();
    const result = await create(
      { websetId: 'ws_1', cron: '0 9 * * 1', count: 0 },
      exa,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid count: 0');
    expect(result.content[0].text).toContain('Must be at least 1');
  });

  it('accepts valid 5-field cron', async () => {
    const exa = mockExa();
    const result = await create(
      { websetId: 'ws_1', cron: '0 9 * * 1' },
      exa,
    );
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe('mon_123');
    expect(parsed.status).toBe('enabled');
  });

  it('passes correct nested params to SDK', async () => {
    const exa = mockExa();
    await create(
      {
        websetId: 'ws_1',
        cron: '0 0 * * *',
        timezone: 'America/New_York',
        query: 'AI startups',
        count: 10,
      },
      exa,
    );
    const mockCreate = (exa.websets.monitors.create as ReturnType<typeof vi.fn>);
    expect(mockCreate).toHaveBeenCalledWith({
      websetId: 'ws_1',
      cadence: { cron: '0 0 * * *', timezone: 'America/New_York' },
      behavior: {
        type: 'search',
        config: { query: 'AI startups', count: 10 },
      },
    });
  });
});
