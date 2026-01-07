// Anthropic API passthrough provider
// Forwards Claude requests to upstream Anthropic-compatible API (z.ai, Anthropic, etc.)

import { Request, Response } from 'express';
import { providers } from '../../config/settings.js';
import { ClaudeRequest } from '../types.js';

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Deep remove cache_control from request body
 * Anthropic API doesn't accept cache_control in messages
 */
function deepRemoveCacheControl(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepRemoveCacheControl);
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'cache_control') continue;
    cleaned[key] = deepRemoveCacheControl(value);
  }
  return cleaned;
}

/**
 * Map model name if configured
 */
function mapModel(model: string): string {
  const mapping = providers.anthropic.modelMapping;
  return mapping[model] || model;
}

/**
 * Forward request to Anthropic API
 */
export async function forwardToAnthropic(
  req: Request,
  res: Response,
  claudeReq: ClaudeRequest
): Promise<void> {
  const config = providers.anthropic;

  if (!config.enabled || !config.apiKey) {
    res.status(503).json({
      type: 'error',
      error: {
        type: 'service_unavailable',
        message: 'Anthropic provider is not configured',
      },
    });
    return;
  }

  // Clean and prepare request body
  const cleanedBody = deepRemoveCacheControl(claudeReq);
  cleanedBody.model = mapModel(claudeReq.model);

  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/v1/messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };

  // Copy through certain headers from original request
  const passthroughHeaders = ['user-agent', 'accept'];
  for (const header of passthroughHeaders) {
    const value = req.get(header);
    if (value) {
      headers[header] = value;
    }
  }

  const isStreaming = claudeReq.stream ?? false;

  try {
    console.log(`[Anthropic] Forwarding to ${url}, model=${cleanedBody.model}, stream=${isStreaming}`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(cleanedBody),
    });

    // Set account info for monitoring
    res.locals.accountEmail = 'anthropic-provider';

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Anthropic] Error ${response.status}: ${errorText}`);
      res.status(response.status).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: errorText,
        },
      });
      return;
    }

    if (isStreaming) {
      // Stream response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = response.body?.getReader();
      if (!reader) {
        res.status(500).json({
          type: 'error',
          error: { type: 'stream_error', message: 'No response body' },
        });
        return;
      }

      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);

          // Try to extract usage from stream
          if (chunk.includes('"usage"')) {
            try {
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data:')) {
                  const data = JSON.parse(line.substring(5).trim());
                  if (data.usage) {
                    res.locals.inputTokens = data.usage.input_tokens;
                    res.locals.outputTokens = data.usage.output_tokens;
                  }
                }
              }
            } catch {
              // Ignore parse errors in stream
            }
          }
        }
        res.end();
      } finally {
        reader.releaseLock();
      }
    } else {
      // Non-streaming response
      const data = await response.json();

      // Extract usage for monitoring
      if (data.usage) {
        res.locals.inputTokens = data.usage.input_tokens;
        res.locals.outputTokens = data.usage.output_tokens;
      }

      res.json(data);
    }
  } catch (err) {
    console.error('[Anthropic] Request failed:', err);
    res.status(502).json({
      type: 'error',
      error: {
        type: 'network_error',
        message: String(err),
      },
    });
  }
}

/**
 * Test connection to Anthropic provider
 */
export async function testAnthropicConnection(): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  const config = providers.anthropic;

  if (!config.enabled) {
    return { success: false, message: 'Provider is not enabled' };
  }

  if (!config.apiKey) {
    return { success: false, message: 'API key is not configured' };
  }

  try {
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok) {
      return { success: true, message: 'Connection successful' };
    }

    const error = await response.text();
    return { success: false, message: `API error: ${response.status} - ${error}` };
  } catch (err) {
    return { success: false, message: `Connection failed: ${err}` };
  }
}
