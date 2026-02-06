import { describe, it, expect } from 'vitest';
import { Exa } from 'exa-js';
import * as websets from '../../../websets.js';

// Dedicated Exa client with an invalid API key
const badExa = new Exa('invalid-api-key-00000000');

describe('Error paths: auth failures', () => {
  it('websets.list with invalid API key → auth error', async () => {
    const result = await websets.list({}, badExa);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    // The error text should mention auth failure, not a generic crash
    const text = result.content[0].text.toLowerCase();
    expect(
      text.includes('unauthorized') ||
      text.includes('forbidden') ||
      text.includes('invalid') ||
      text.includes('authentication') ||
      text.includes('api key') ||
      text.includes('401') ||
      text.includes('403')
    ).toBe(true);
  });

  it('websets.create with invalid API key → auth error', async () => {
    const result = await websets.create({
      searchQuery: 'test',
      searchCount: 5,
    }, badExa);

    expect(result.isError).toBe(true);
    const text = result.content[0].text.toLowerCase();
    expect(
      text.includes('unauthorized') ||
      text.includes('forbidden') ||
      text.includes('invalid') ||
      text.includes('authentication') ||
      text.includes('api key') ||
      text.includes('401') ||
      text.includes('403')
    ).toBe(true);
  });

  it('websets.preview with invalid API key → auth error', async () => {
    const result = await websets.preview({ query: 'test' }, badExa);

    expect(result.isError).toBe(true);
    const text = result.content[0].text.toLowerCase();
    expect(
      text.includes('unauthorized') ||
      text.includes('forbidden') ||
      text.includes('invalid') ||
      text.includes('authentication') ||
      text.includes('api key') ||
      text.includes('401') ||
      text.includes('403')
    ).toBe(true);
  });
});
