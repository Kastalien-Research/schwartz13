import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExaApiClient, handleApiError } from './api.js';
import { API_CONFIG } from '../tools/config.js';

describe('ExaApiClient', () => {
  let client: ExaApiClient;
  const apiKey = 'test-api-key';
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = mockFetch;
    client = new ExaApiClient(apiKey);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create client with correct configuration', () => {
    expect(client).toBeInstanceOf(ExaApiClient);
  });

  it('should make GET request correctly', async () => {
    const mockData = { id: '123', name: 'Test' };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    const result = await client.get('/test', { param: 'value' });

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_CONFIG.BASE_URL}/test?param=value`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-api-key': apiKey,
        }),
      })
    );
    expect(result).toEqual(mockData);
  });

  it('should make POST request correctly', async () => {
    const mockData = { success: true };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    const payload = { name: 'New Item' };
    const result = await client.post('/test', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_CONFIG.BASE_URL}/test`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-api-key': apiKey,
        }),
      })
    );
    expect(result).toEqual(mockData);
  });

  it('should make PUT request correctly', async () => {
    const mockData = { updated: true };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    const payload = { name: 'Updated Item' };
    const result = await client.put('/test', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_CONFIG.BASE_URL}/test`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    );
    expect(result).toEqual(mockData);
  });

  it('should make PATCH request correctly', async () => {
    const mockData = { patched: true };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    const payload = { name: 'Patched Item' };
    const result = await client.patch('/test', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_CONFIG.BASE_URL}/test`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    );
    expect(result).toEqual(mockData);
  });

  it('should make DELETE request correctly', async () => {
    const mockData = { deleted: true };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    const result = await client.delete('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_CONFIG.BASE_URL}/test`,
      expect.objectContaining({
        method: 'DELETE',
      })
    );
    expect(result).toEqual(mockData);
  });

  it('should handle request timeout', async () => {
    vi.useFakeTimers();
    const abortSpy = vi.fn();
    const abortController = {
      abort: abortSpy,
      signal: {} as AbortSignal,
    };
    vi.spyOn(global, 'AbortController').mockImplementation(() => abortController as any);

    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const promise = client.get('/test');
    vi.advanceTimersByTime(30000);

    await expect(promise).rejects.toThrow();
    expect(abortSpy).toHaveBeenCalled();
  });
});

describe('handleApiError', () => {
  const mockLogger = {
    log: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should handle fetch error with response', async () => {
    const mockResponse = {
      status: 400,
      statusText: 'Bad Request',
      json: vi.fn().mockResolvedValue({
        message: 'Bad Request',
        details: 'Invalid parameter',
      }),
    };

    const fetchError = new Error('API Error') as any;
    fetchError.status = 400;
    fetchError.response = mockResponse as unknown as Response;
    fetchError.errorData = {
      message: 'Bad Request',
      details: 'Invalid parameter',
    };

    const result = handleApiError(fetchError, mockLogger, 'testing error');

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error testing error (400): Bad Request');
    expect(result.content[0].text).toContain('Details: Invalid parameter');
    expect(mockLogger.log).toHaveBeenCalledWith('API error (400): Bad Request');
  });

  it('should handle generic error', () => {
    const error = new Error('Something went wrong');

    const result = handleApiError(error, mockLogger, 'testing generic');

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error testing generic: Something went wrong');
  });

  it('should use help text generator for specific status codes', () => {
    const fetchError = new Error('API Error') as any;
    fetchError.status = 400;
    fetchError.errorData = {
      message: 'Bad Request',
    };

    const generator = (status: number) => status === 400 ? '\nHelpful tip' : '';
    const result = handleApiError(fetchError, mockLogger, 'testing help', generator);

    expect(result.content[0].text).toContain('Helpful tip');
  });

  it('should handle error with status but no errorData', () => {
    const fetchError = new Error('HTTP error! status: 500') as any;
    fetchError.status = 500;

    const result = handleApiError(fetchError, mockLogger, 'testing status only');

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error testing status only (500): HTTP error! status: 500');
  });
});

