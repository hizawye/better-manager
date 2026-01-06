// Upstream client for making requests to Gemini API

import { GeminiRequest, GeminiResponse } from './types.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export interface UpstreamResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<GeminiResponse>;
  text(): Promise<string>;
  body: ReadableStream<Uint8Array> | null;
}

export class UpstreamClient {
  private timeout: number;

  constructor(timeout: number = 300000) { // 5 min default
    this.timeout = timeout;
  }

  /**
   * Call Gemini generateContent or streamGenerateContent
   */
  async callGenerateContent(
    model: string,
    method: 'generateContent' | 'streamGenerateContent',
    accessToken: string,
    body: GeminiRequest,
    queryParams?: string
  ): Promise<Response> {
    const url = new URL(
      `/v1beta/models/${model}:${method}`,
      GEMINI_BASE_URL
    );

    if (queryParams) {
      url.search = queryParams;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Call internal v1 method (for compatibility layer)
   */
  async callV1Internal(
    method: string,
    accessToken: string,
    body: GeminiRequest,
    queryString?: string
  ): Promise<Response> {
    // Determine model from the request context (passed separately in real impl)
    // For now, use gemini-2.0-flash as default
    const model = 'gemini-2.0-flash';

    return this.callGenerateContent(
      model,
      method as 'generateContent' | 'streamGenerateContent',
      accessToken,
      body,
      queryString
    );
  }

  /**
   * List available models
   */
  async listModels(accessToken: string): Promise<Response> {
    const url = new URL('/v1beta/models', GEMINI_BASE_URL);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response;
  }

  /**
   * Count tokens
   */
  async countTokens(
    model: string,
    accessToken: string,
    body: { contents: GeminiRequest['contents'] }
  ): Promise<Response> {
    const url = new URL(
      `/v1beta/models/${model}:countTokens`,
      GEMINI_BASE_URL
    );

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    return response;
  }
}

// Singleton instance
export const upstreamClient = new UpstreamClient();
