// Claude protocol handler

import { Router, Request, Response } from 'express';
import { tokenManager } from '../token-manager.js';
import { upstreamClient, unwrapStreamChunk } from '../upstream.js';
import { transformClaudeRequest, transformClaudeResponse, transformClaudeStreamChunk } from '../mappers/claude.js';
import { ClaudeRequest } from '../types.js';
import crypto from 'crypto';

const router = Router();

// Model mapping (Claude model names to Gemini)
const MODEL_MAPPING: Record<string, string> = {
  'claude-3-opus-20240229': 'gemini-2.5-flash',
  'claude-3-sonnet-20240229': 'gemini-2.5-flash',
  'claude-3-haiku-20240307': 'gemini-2.5-flash',
  'claude-3-5-sonnet-20240620': 'gemini-2.5-flash',
  'claude-3-5-sonnet-20241022': 'gemini-2.5-flash',
  'claude-3-5-haiku-20241022': 'gemini-2.5-flash',
  'claude-sonnet-4-20250514': 'gemini-2.5-flash',
  'claude-opus-4-20250514': 'gemini-2.5-flash',
  // Direct Gemini passthrough
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-1.5-pro': 'gemini-1.5-pro',
};

const MAX_RETRY_ATTEMPTS = 3;

function extractSessionId(req: ClaudeRequest): string {
  if (req.metadata?.user_id) return 'claude:' + req.metadata.user_id;
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

function resolveModel(model: string): string {
  return MODEL_MAPPING[model] ?? (model.startsWith('gemini-') ? model : 'gemini-2.0-flash');
}

// List Claude models
router.get('/models/claude', async (_req: Request, res: Response) => {
  const models = Object.keys(MODEL_MAPPING).filter(m => m.startsWith('claude')).map(id => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'anthropic',
  }));
  res.json({ object: 'list', data: models });
});

// Messages endpoint
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const claudeReq: ClaudeRequest = req.body;

    if (!claudeReq.messages || claudeReq.messages.length === 0) {
      return res.status(400).json({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'messages is required' }
      });
    }

    if (!claudeReq.max_tokens) {
      claudeReq.max_tokens = 4096;
    }

    const mappedModel = resolveModel(claudeReq.model);
    const sessionId = extractSessionId(claudeReq);
    const poolSize = tokenManager.size();
    const maxAttempts = Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, poolSize));
    const stream = claudeReq.stream ?? false;
    let lastError = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken('chat', attempt > 0, sessionId);
        console.log('Using account:', email, 'for Claude model:', claudeReq.model, 'stream:', stream);

        const geminiBody = transformClaudeRequest(claudeReq, mappedModel);

        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          const response = await upstreamClient.callGenerateContent(
            mappedModel,
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
              continue;
            }

            res.write('event: error\ndata: ' + JSON.stringify({ type: 'error', error: { type: 'api_error', message: errorText } }) + '\n\n');
            res.end();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            res.write('event: error\ndata: ' + JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'No response body' } }) + '\n\n');
            res.end();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          const messageId = 'msg_' + crypto.randomBytes(12).toString('hex');
          const blockIndex = { current: 0 };

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
                  } catch (e) {
                    // Skip malformed chunks
                  }
                }
              }
            }

            res.end();
            return;
          } catch (err) {
            console.error('Stream processing error:', err);
            res.end();
            return;
          }
        } else {
          const response = await upstreamClient.callGenerateContent(
            mappedModel,
            'generateContent',
            accessToken,
            projectId,
            geminiBody
          );

          if (!response.ok) {
            const status = response.status;
            const errorText = await response.text();
            lastError = 'HTTP ' + status + ': ' + errorText;

            if (status === 429 || status === 503 || status === 529) {
              const retryAfter = response.headers.get('Retry-After');
              tokenManager.markRateLimited(email, status, retryAfter ?? undefined, errorText);
              continue;
            }

            if (status >= 400 && status < 500) {
              return res.status(status).json({
                type: 'error',
                error: { type: 'api_error', message: errorText }
              });
            }
          } else {
            const wrappedResp = await response.json();
            const geminiResp = unwrapStreamChunk(wrappedResp);
            const claudeResp = transformClaudeResponse(geminiResp, claudeReq.model);
            return res.json(claudeResp);
          }
        }

      } catch (err) {
        lastError = String(err);
        console.error('Request attempt', attempt + 1, 'failed:', err);
      }
    }

    res.status(503).json({
      type: 'error',
      error: { type: 'overloaded_error', message: lastError || 'All accounts failed' }
    });
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({
      type: 'error',
      error: { type: 'api_error', message: String(err) }
    });
  }
});

// Count tokens endpoint
router.post('/messages/count_tokens', async (req: Request, res: Response) => {
  try {
    const { messages, system } = req.body;
    // Simple estimation: ~4 chars per token
    let totalChars = (system || '').length;
    for (const msg of messages || []) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      }
    }
    const estimatedTokens = Math.ceil(totalChars / 4);
    res.json({ input_tokens: estimatedTokens });
  } catch (err) {
    res.status(500).json({ type: 'error', error: { type: 'api_error', message: String(err) } });
  }
});

export default router;
