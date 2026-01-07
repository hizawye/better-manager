// OpenAI protocol handler - Gemini-only backend with streaming support

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { tokenManager } from '../token-manager.js';
import { upstreamClient, unwrapStreamChunk } from '../upstream.js';
import { transformOpenAIRequest, transformOpenAIResponse, transformOpenAIStreamChunk } from '../mappers/openai.js';
import { OpenAIRequest } from '../types.js';
import { routeOpenAIRequest, getOpenAIModelList, getFallbackModel } from '../routing/model-router.js';
import { ProxyError, ProxyErrorType, formatOpenAIError, calculateBackoff, sleep } from '../errors.js';

const router = Router();

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Extract or generate session ID for account stickiness
 */
function extractSessionId(req: OpenAIRequest): string {
  // Use user field if available
  if (req.user) {
    return 'openai:' + req.user;
  }

  // Hash first few messages for session identification
  const content = req.messages.slice(0, 3).map(m =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  ).join('|');

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash = hash & hash;
  }
  return 'openai:' + Math.abs(hash).toString(36);
}

/**
 * List available models
 */
router.get('/models', async (_req: Request, res: Response) => {
  const models = getOpenAIModelList();
  res.json({ object: 'list', data: models });
});

/**
 * Chat completions endpoint - main OpenAI API
 */
router.post('/chat/completions', async (req: Request, res: Response) => {
  try {
    const openaiReq: OpenAIRequest = req.body;

    // Validate request
    if (!openaiReq.messages || openaiReq.messages.length === 0) {
      return res.status(400).json(formatOpenAIError(
        new ProxyError(ProxyErrorType.InvalidRequest, 'messages is required')
      ));
    }

    const stream = openaiReq.stream ?? false;
    const poolSize = tokenManager.size();

    if (poolSize === 0) {
      return res.status(503).json(formatOpenAIError(
        new ProxyError(ProxyErrorType.AccountError, 'No accounts available in pool')
      ));
    }

    // Route to appropriate Gemini model
    const routing = routeOpenAIRequest(openaiReq);
    console.log(`[OpenAI] Routing: ${openaiReq.model} → ${routing.model} (${routing.reason})`);

    let currentModel = routing.model;
    const sessionId = extractSessionId(openaiReq);
    const maxAttempts = Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, poolSize));
    let lastError: ProxyError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken(
          'chat',
          attempt > 0, // force rotate on retry
          sessionId
        );

        console.log(`[OpenAI] Attempt ${attempt + 1}/${maxAttempts}: account=${email}, model=${currentModel}, stream=${stream}`);

        // Transform request to Gemini format
        const geminiBody = transformOpenAIRequest(openaiReq, currentModel);

        if (stream) {
          return await handleStreamingResponse(
            res, currentModel, accessToken, projectId, email, geminiBody, openaiReq
          );
        } else {
          return await handleNonStreamingResponse(
            res, currentModel, accessToken, projectId, email, geminiBody, openaiReq
          );
        }

      } catch (err) {
        const proxyError = err instanceof ProxyError
          ? err
          : new ProxyError(ProxyErrorType.NetworkError, String(err));

        lastError = proxyError;
        console.error(`[OpenAI] Attempt ${attempt + 1} failed:`, proxyError.message);

        // Check if retryable
        if (!proxyError.retryable && attempt < maxAttempts - 1) {
          // Try model fallback
          const fallback = getFallbackModel(currentModel);
          if (fallback) {
            console.log(`[OpenAI] Trying fallback model: ${currentModel} → ${fallback}`);
            currentModel = fallback;
          }
        }

        // Exponential backoff between retries
        if (attempt < maxAttempts - 1 && proxyError.retryable) {
          const backoffMs = calculateBackoff(attempt);
          console.log(`[OpenAI] Backing off ${Math.round(backoffMs)}ms before retry`);
          await sleep(backoffMs);
        }
      }
    }

    // All attempts failed
    res.status(lastError?.statusCode ?? 503).json(formatOpenAIError(
      lastError ?? new ProxyError(ProxyErrorType.ServerOverload, 'All accounts failed')
    ));

  } catch (err) {
    console.error('[OpenAI] Unexpected error:', err);
    res.status(500).json(formatOpenAIError(
      err instanceof ProxyError ? err : new ProxyError(ProxyErrorType.NetworkError, String(err))
    ));
  }
});

/**
 * Handle streaming response
 */
async function handleStreamingResponse(
  res: Response,
  model: string,
  accessToken: string,
  projectId: string,
  email: string,
  geminiBody: any,
  openaiReq: OpenAIRequest
): Promise<void> {
  // Set account email for monitoring
  res.locals.accountEmail = email;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const response = await upstreamClient.callGenerateContent(
    model,
    'streamGenerateContent',
    accessToken,
    projectId,
    geminiBody,
    'alt=sse'
  );

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();

    if (status === 429 || status === 503 || status === 529) {
      const retryAfter = response.headers.get('Retry-After');
      tokenManager.markRateLimited(email, status, retryAfter ?? undefined, errorText);
      throw ProxyError.fromHttpStatus(status, errorText, retryAfter ? parseInt(retryAfter) : undefined);
    }

    throw ProxyError.fromHttpStatus(status, errorText);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ProxyError(ProxyErrorType.StreamError, 'No response body from upstream');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  const chunkId = 'chatcmpl-' + crypto.randomBytes(12).toString('hex');
  let totalOutputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const data = trimmed.substring(5).trim();
          try {
            const geminiChunk = JSON.parse(data);
            const unwrapped = unwrapStreamChunk(geminiChunk);
            const openaiChunk = transformOpenAIStreamChunk(unwrapped, openaiReq.model || 'gpt-4o', chunkId);
            res.write('data: ' + JSON.stringify(openaiChunk) + '\n\n');

            // Track token usage from chunks
            if (unwrapped.usageMetadata) {
              totalOutputTokens = unwrapped.usageMetadata.candidatesTokenCount || 0;
              res.locals.inputTokens = unwrapped.usageMetadata.promptTokenCount || 0;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }

    // Set output tokens for monitoring
    res.locals.outputTokens = totalOutputTokens;

    // Send final chunk with finish_reason
    const finalChunk = {
      id: chunkId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: openaiReq.model || 'gpt-4o',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    };
    res.write('data: ' + JSON.stringify(finalChunk) + '\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[OpenAI] Stream error:', err);
    res.end();
  } finally {
    reader.releaseLock();
  }
}


async function handleNonStreamingResponse(
  res: Response,
  model: string,
  accessToken: string,
  projectId: string,
  email: string,
  geminiBody: any,
  openaiReq: OpenAIRequest
): Promise<void> {
  // Set account email for monitoring
  res.locals.accountEmail = email;

  const response = await upstreamClient.callGenerateContent(
    model,
    'generateContent',
    accessToken,
    projectId,
    geminiBody
  );

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();

    if (status === 429 || status === 503 || status === 529) {
      const retryAfter = response.headers.get('Retry-After');
      tokenManager.markRateLimited(email, status, retryAfter ?? undefined, errorText);
      throw ProxyError.fromHttpStatus(status, errorText, retryAfter ? parseInt(retryAfter) : undefined);
    }

    throw ProxyError.fromHttpStatus(status, errorText);
  }

  const wrappedResp = await response.json();
  const geminiResp = unwrapStreamChunk(wrappedResp);
  const openaiResp = transformOpenAIResponse(geminiResp, openaiReq.model);

  // Set token usage for monitoring
  if (openaiResp.usage) {
    res.locals.inputTokens = openaiResp.usage.prompt_tokens;
    res.locals.outputTokens = openaiResp.usage.completion_tokens;
  }

  res.json(openaiResp);
}

export default router;
