import { describe, it, expect } from 'vitest';
import { createTestClient, HAS_API_KEY } from '../setup.js';
import * as websets from '../../../websets.js';
import * as items from '../../../items.js';
import * as imports from '../../../imports.js';

const FAKE_ID = 'nonexistent-id-12345';

describe.skipIf(!HAS_API_KEY)('Error paths: convenience operations', () => {
  const exa = HAS_API_KEY ? createTestClient() : (null as any);

  function assertError(result: any, substring?: string) {
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text.length).toBeGreaterThan(0);
    if (substring) {
      expect(result.content[0].text.toLowerCase()).toContain(substring.toLowerCase());
    }
  }

  it('websets.waitUntilIdle — nonexistent ID returns error', async () => {
    const result = await websets.waitUntilIdle(
      { id: FAKE_ID, timeout: 5_000, pollInterval: 1_000 },
      exa,
    );
    assertError(result);
  });

  it('items.getAll — nonexistent websetId returns error', async () => {
    const result = await items.getAll({ websetId: FAKE_ID, maxItems: 10 }, exa);
    assertError(result);
  });

  it('imports.waitUntilCompleted — nonexistent ID returns error', async () => {
    const result = await imports.waitUntilCompleted(
      { id: FAKE_ID, timeout: 5_000, pollInterval: 1_000 },
      exa,
    );
    assertError(result);
  });
});
