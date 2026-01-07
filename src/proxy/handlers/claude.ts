// Claude protocol handler - Gemini-only backend

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { tokenManager } from '../token-manager.js';
import { upstreamClient, unwrapStreamChunk } from '../upstream.js';
import { transformClaudeRequest, transformClaudeResponse, transformClaudeStreamChunk, createClaudeStreamEvent, filterInvalidThinkingBlocks } from '../mappers/claude.js';
import { ClaudeRequest } from '../types.js';
import { routeClaudeRequest, getClaudeModelList, getFallbackModel } from '../routing/model-router.js';
import { ProxyError, ProxyErrorType, formatClaudeError, calculateBackoff, sleep } from '../errors.js';

const router = Router();

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Extract or generate session ID for account stickiness
 */
function extractSessionId(req: ClaudeRequest): string {
  // Use user_id from metadata if available
  if (req.metadata?.user_id) {
    return 'claude:' + req.metadata.user_id;
  }

  // Hash first few messages for session identification
  const content = req.messages.slice(0, 3).map(m =>
    typeof m.content === 'string' ? m.content : ''
  ).join('|');

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash = hash & hash;
  }
  return 'claude:' + Math.abs(hash).toString(36);
}

/**
 * List Claude models
 */
router.get('/models/claude', async (_req: Request, res: Response) => {
  const models = getClaudeModelList();
  res.json({ object: 'list', data: models });
});

/**
 * List models - Anthropic API compatible endpoint
 * Claude Code calls this to get available models
 */
router.get('/models', async (_req: Request, res: Response) => {
  const models = getClaudeModelList();
  res.json({
    object: 'list',
    data: models.map(m => ({
      ...m,
      type: 'model',
      display_name: m.id,
    })),
  });
});

/**
 * Messages endpoint - main Claude API
 */
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const claudeReq: ClaudeRequest = req.body;

    // Validate request
    if (!claudeReq.messages || claudeReq.messages.length === 0) {
      return res.status(400).json(formatClaudeError(
        new ProxyError(ProxyErrorType.InvalidRequest, 'messages is required')
      ));
    }

    // Set default max_tokens if not provided
    if (!claudeReq.max_tokens) {
      claudeReq.max_tokens = 4096;
    }

    // Filter invalid thinking blocks from history (prevents Gemini errors)
    filterInvalidThinkingBlocks(claudeReq.messages);

    const stream = claudeReq.stream ?? false;
    const poolSize = tokenManager.size();

    if (poolSize === 0) {
      return res.status(503).json(formatClaudeError(
        new ProxyError(ProxyErrorType.AccountError, 'No accounts available in pool')
      ));
    }

    // Route to appropriate Gemini model
    const routing = routeClaudeRequest(claudeReq);
    console.log(`[Claude] Routing: ${claudeReq.model} → ${routing.model} (${routing.reason})`);

    let currentModel = routing.model;
    const sessionId = extractSessionId(claudeReq);
    const maxAttempts = Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, poolSize));
    let lastError: ProxyError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken(
          'chat',
          attempt > 0, // force rotate on retry
          sessionId
        );

        console.log(`[Claude] Attempt ${attempt + 1}/${maxAttempts}: account=${email}, model=${currentModel}, stream=${stream}`);

        // Transform request to Gemini format
        const geminiBody = transformClaudeRequest(claudeReq, currentModel);

        if (stream) {
          return await handleStreamingResponse(
            res, currentModel, accessToken, projectId, email, geminiBody, claudeReq
          );
        } else {
          return await handleNonStreamingResponse(
            res, currentModel, accessToken, projectId, email, geminiBody, claudeReq
          );
        }

      } catch (err) {
        const proxyError = err instanceof ProxyError
          ? err
          : new ProxyError(ProxyErrorType.NetworkError, String(err));

        lastError = proxyError;
        console.error(`[Claude] Attempt ${attempt + 1} failed:`, proxyError.message);

        // Check if retryable
        if (!proxyError.retryable && attempt < maxAttempts - 1) {
          // Try model fallback
          const fallback = getFallbackModel(currentModel);
          if (fallback) {
            console.log(`[Claude] Trying fallback model: ${currentModel} → ${fallback}`);
            currentModel = fallback;
          }
        }

        // Exponential backoff between retries
        if (attempt < maxAttempts - 1 && proxyError.retryable) {
          const backoffMs = calculateBackoff(attempt);
          console.log(`[Claude] Backing off ${Math.round(backoffMs)}ms before retry`);
          await sleep(backoffMs);
        }
      }
    }

    // All attempts failed
    res.status(lastError?.statusCode ?? 503).json(formatClaudeError(
      lastError ?? new ProxyError(ProxyErrorType.ServerOverload, 'All accounts failed')
    ));

  } catch (err) {
    console.error('[Claude] Unexpected error:', err);
    res.status(500).json(formatClaudeError(
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
  claudeReq: ClaudeRequest
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
  const messageId = 'msg_' + crypto.randomBytes(12).toString('hex');
  const blockIndex = { current: 0 };

  // Send message_start event
  res.write(createClaudeStreamEvent('message_start', {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: claudeReq.model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  }));

  // Send initial content_block_start
  res.write(createClaudeStreamEvent('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  }));

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
            for (const sseEvent of transformClaudeStreamChunk(unwrapped, claudeReq.model, messageId, blockIndex)) {
              res.write(sseEvent);
            }
            // Track token usage from chunks
            if (unwrapped.usageMetadata) {
              res.locals.inputTokens = unwrapped.usageMetadata.promptTokenCount || 0;
              res.locals.outputTokens = unwrapped.usageMetadata.candidatesTokenCount || 0;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }

    res.end();
  } catch (err) {
    console.error('[Claude] Stream processing error:', err);
    res.end();
  } finally {
    reader.releaseLock();
  }
}

/**
 * Handle non-streaming response
 */
async function handleNonStreamingResponse(
  res: Response,
  model: string,
  accessToken: string,
  projectId: string,
  email: string,
  geminiBody: any,
  claudeReq: ClaudeRequest
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
  const claudeResp = transformClaudeResponse(geminiResp, claudeReq.model);

  // Set token usage for monitoring
  if (claudeResp.usage) {
    res.locals.inputTokens = claudeResp.usage.input_tokens;
    res.locals.outputTokens = claudeResp.usage.output_tokens;
  }

  res.json(claudeResp);
}

/**
 * Count tokens endpoint
 */
router.post('/messages/count_tokens', async (req: Request, res: Response) => {
  try {
    const { messages, system } = req.body;

    // Simple estimation: ~4 chars per token
    let totalChars = (system || '').length;
    for (const msg of messages || []) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            totalChars += block.text.length;
          }
        }
      }
    }

    const estimatedTokens = Math.ceil(totalChars / 4);
    res.json({ input_tokens: estimatedTokens });
  } catch (err) {
    res.status(500).json(formatClaudeError(
      new ProxyError(ProxyErrorType.InvalidRequest, String(err))
    ));
  }
});

export default router;
