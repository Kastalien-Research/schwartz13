import { API_CONFIG } from "../tools/config.js";

interface FetchError extends Error {
  response?: Response;
  status?: number;
  errorData?: {
    message?: string;
    details?: string;
  };
}

export class ExaApiClient {
  private baseURL: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("EXA_API_KEY is required. Please provide it in the configuration.");
    }

    this.baseURL = API_CONFIG.BASE_URL;
    this.headers = {
      'accept': 'application/json',
      'content-type': 'application/json',
      'x-api-key': apiKey
    };
    this.timeout = 30000;
  }

  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const fullUrl = `${this.baseURL}${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: FetchError = new Error(`HTTP error! status: ${response.status}`);
        error.response = response;
        error.status = response.status;
        
        // Try to parse error response body
        try {
          const errorData = await response.json();
          error.errorData = {
            message: errorData?.message,
            details: errorData?.details,
          };
        } catch {
          // If parsing fails, use status text
          error.errorData = {
            message: response.statusText || `HTTP error! status: ${response.status}`,
          };
        }
        
        throw error;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError: FetchError = new Error('Request timeout');
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    }
  }

  async get<T>(url: string, params?: any): Promise<T> {
    let fullUrl = url;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        fullUrl = `${url}?${queryString}`;
      }
    }
    return this.request<T>(fullUrl, { method: 'GET' });
  }

  async post<T>(url: string, data?: any): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(url: string, data?: any): Promise<T> {
    return this.request<T>(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    return this.request<T>(url, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'DELETE' });
  }
}

export interface McpErrorResponse {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

export function handleApiError(
  error: unknown, 
  logger: { log: (msg: string) => void, error: (err: unknown) => void },
  contextMessage: string,
  helpTextGenerator?: (statusCode: number) => string
): McpErrorResponse {
  logger.error(error);
  
  const fetchError = error as FetchError;
  if (fetchError.response || fetchError.status) {
    const statusCode = fetchError.status || fetchError.response?.status || 'unknown';
    const errorMessage = fetchError.errorData?.message || fetchError.message || 'Unknown error';
    const errorDetails = fetchError.errorData?.details || '';
    
    logger.log(`API error (${statusCode}): ${errorMessage}`);
    
    let helpText = '';
    if (helpTextGenerator && typeof statusCode === 'number') {
      helpText = helpTextGenerator(statusCode);
    }
    
    return {
      content: [{
        type: "text" as const,
        text: `Error ${contextMessage} (${statusCode}): ${errorMessage}${errorDetails ? '\nDetails: ' + errorDetails : ''}${helpText}`
      }],
      isError: true,
    };
  }
  
  return {
    content: [{
      type: "text" as const,
      text: `Error ${contextMessage}: ${error instanceof Error ? error.message : String(error)}`
    }],
    isError: true,
  };
}
