// Upstream client for making requests to Gemini API via Cloud Code

import { GeminiRequest, GeminiResponse } from './types.js';
import crypto from 'crypto';

// Cloud Code v1internal endpoints (with fallback)
const V1_INTERNAL_ENDPOINTS = [
  'https://cloudcode-pa.googleapis.com/v1internal',
  'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal',
];

const USER_AGENT = 'antigravity/1.11.9 windows/amd64';

export interface UpstreamResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<GeminiResponse>;
  text(): Promise<string>;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * Wrap request body for v1internal format
 */
function wrapRequest(body: GeminiRequest, projectId: string, model: string): object {
  return {
    project: projectId,
    requestId: `agent-${crypto.randomUUID()}`,
    request: body,
    model: model,
    userAgent: 'antigravity',
    requestType: 'agent',
  };
}

/**
 * Unwrap response from v1internal format
 */
function unwrapResponse(response: any): any {
  return response.response ?? response;
}

/**
 * Check if we should try next endpoint based on status
 */
function shouldTryNextEndpoint(status: number): boolean {
  return status === 429 || status === 408 || status === 404 || status >= 500;
}

export class UpstreamClient {
  private timeout: number;

  constructor(timeout: number = 300000) { // 5 min default
    this.timeout = timeout;
  }

  /**
   * Fetch project_id from loadCodeAssist API
   */
  async fetchProjectId(accessToken: string): Promise<string> {
    const url = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        metadata: {
          ideType: 'ANTIGRAVITY',
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`loadCodeAssist failed ${response.status}: ${text}`);
    }

    const data = await response.json() as { cloudaicompanionProject?: string };

    if (data.cloudaicompanionProject) {
      return data.cloudaicompanionProject;
    }

    // Fallback: generate mock project ID
    const adjectives = ['useful', 'bright', 'swift', 'calm', 'bold'];
    const nouns = ['fuze', 'wave', 'spark', 'flow', 'core'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const random = crypto.randomBytes(3).toString('hex').slice(0, 5);
    return `${adj}-${noun}-${random}`;
  }

  /**
   * Call v1internal API with endpoint fallback
   */
  async callV1Internal(
    method: string,
    accessToken: string,
    body: object,
    queryString?: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let lastError: string | null = null;

    try {
      for (let i = 0; i < V1_INTERNAL_ENDPOINTS.length; i++) {
        const baseUrl = V1_INTERNAL_ENDPOINTS[i];
        const hasNext = i + 1 < V1_INTERNAL_ENDPOINTS.length;

        let url = `${baseUrl}:${method}`;
        if (queryString) {
          url += `?${queryString}`;
        }

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'User-Agent': USER_AGENT,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (response.ok) {
            return response;
          }

          // Check if we should try next endpoint
          if (hasNext && shouldTryNextEndpoint(response.status)) {
            console.log(`Endpoint ${baseUrl} returned ${response.status}, trying next...`);
            lastError = `Upstream ${baseUrl} returned ${response.status}`;
            continue;
          }

          // Return non-retryable error or last endpoint response
          return response;
        } catch (err) {
          lastError = `Request failed at ${baseUrl}: ${err}`;
          if (!hasNext) {
            throw new Error(lastError);
          }
          continue;
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    throw new Error(lastError ?? 'All endpoints failed');
  }

  /**
   * Call Gemini generateContent via Cloud Code
   */
  async callGenerateContent(
    model: string,
    method: 'generateContent' | 'streamGenerateContent',
    accessToken: string,
    projectId: string,
    body: GeminiRequest,
    queryParams?: string
  ): Promise<Response> {
    const wrappedBody = wrapRequest(body, projectId, model);
    return this.callV1Internal(method, accessToken, wrappedBody, queryParams);
  }

  /**
   * Fetch available models
   */
  async fetchAvailableModels(accessToken: string): Promise<any> {
    const response = await this.callV1Internal('fetchAvailableModels', accessToken, {});
    if (!response.ok) {
      throw new Error(`fetchAvailableModels failed: ${response.status}`);
    }
    return response.json();
  }
}

// Helper to unwrap streaming responses
export function unwrapStreamChunk(chunk: any): any {
  return unwrapResponse(chunk);
}

// Singleton instance
export const upstreamClient = new UpstreamClient();
