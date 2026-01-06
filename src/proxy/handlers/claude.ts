// Claude protocol handler

import { Router, Request, Response } from 'express';
import { tokenManager } from '../token-manager.js';
import { upstreamClient } from '../upstream.js';
import { transformClaudeRequest, transformClaudeResponse } from '../mappers/claude.js';
import { ClaudeRequest } from '../types.js';

const router = Router();

// Model mapping (Claude model names to Gemini)
const MODEL_MAPPING: Record<string, string> = {
  'claude-3-opus-20240229': 'gemini-2.0-flash',
  'claude-3-sonnet-20240229': 'gemini-2.0-flash',
  'claude-3-haiku-20240307': 'gemini-2.0-flash',
  'claude-3-5-sonnet-20240620': 'gemini-2.0-flash',
  'claude-3-5-sonnet-20241022': 'gemini-2.0-flash',
  'claude-3-5-haiku-20241022': 'gemini-2.0-flash',
  'claude-sonnet-4-20250514': 'gemini-2.0-flash',
  'claude-opus-4-20250514': 'gemini-2.0-flash',
  // Direct Gemini passthrough
  'gemini-2.0-flash': 'gemini-2.0-flash',
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
    let lastError = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken('chat', attempt > 0, sessionId);
        console.log('Using account:', email, 'for Claude model:', claudeReq.model);

        const geminiBody = transformClaudeRequest(claudeReq, projectId, mappedModel);

        // For now, only support non-streaming
        const response = await upstreamClient.callGenerateContent(
          mappedModel,
          'generateContent',
          accessToken,
          geminiBody
        );

        if (response.ok) {
          const geminiResp = await response.json();
          const claudeResp = transformClaudeResponse(geminiResp, claudeReq.model);
          return res.json(claudeResp);
        }

        // Handle errors
        const status = response.status;
        const errorText = await response.text();
        lastError = 'HTTP ' + status + ': ' + errorText;

        // Rate limit handling
        if (status === 429 || status === 503 || status === 529) {
          const retryAfter = response.headers.get('Retry-After');
          tokenManager.markRateLimited(email, status, retryAfter ?? undefined, errorText);
          continue;
        }

        // Non-retryable error
        if (status >= 400 && status < 500) {
          return res.status(status).json({
            type: 'error',
            error: { type: 'api_error', message: errorText }
          });
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
