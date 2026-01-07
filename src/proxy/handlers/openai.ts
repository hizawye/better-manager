// OpenAI protocol handler (non-streaming for now)

import { Router, Request, Response } from 'express';
import { tokenManager } from '../token-manager.js';
import { upstreamClient, unwrapStreamChunk } from '../upstream.js';
import { transformOpenAIRequest, transformOpenAIResponse } from '../mappers/openai.js';
import { OpenAIRequest } from '../types.js';

const router = Router();

const MODEL_MAPPING: Record<string, string> = {
  'gpt-4': 'gemini-2.5-flash',
  'gpt-4-turbo': 'gemini-2.5-flash',
  'gpt-4o': 'gemini-2.5-flash',
  'gpt-4o-mini': 'gemini-2.5-flash',
  'gpt-3.5-turbo': 'gemini-2.5-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-1.5-flash': 'gemini-2.5-flash',
};

const MAX_RETRY_ATTEMPTS = 3;

function extractSessionId(req: OpenAIRequest): string {
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

function resolveModel(model: string): string {
  return MODEL_MAPPING[model] ?? (model.startsWith('gemini-') ? model : 'gemini-2.5-flash');
}

// List OpenAI models
router.get('/models', async (_req: Request, res: Response) => {
  const models = Object.keys(MODEL_MAPPING).map(id => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'openai',
  }));
  res.json({ object: 'list', data: models });
});

// Chat completions endpoint
router.post('/chat/completions', async (req: Request, res: Response) => {
  try {
    const openaiReq: OpenAIRequest = req.body;

    if (!openaiReq.messages || openaiReq.messages.length === 0) {
      return res.status(400).json({
        error: { message: 'messages is required', type: 'invalid_request_error' }
      });
    }

    const mappedModel = resolveModel(openaiReq.model || 'gpt-4o');
    const sessionId = extractSessionId(openaiReq);
    const poolSize = tokenManager.size();
    const maxAttempts = Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, poolSize));
    let lastError = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken('chat', attempt > 0, sessionId);
        console.log('Using account:', email, 'for OpenAI model:', openaiReq.model);

        const geminiBody = transformOpenAIRequest(openaiReq, mappedModel);

        // For now, only support non-streaming
        const response = await upstreamClient.callGenerateContent(
          mappedModel,
          'generateContent',
          accessToken,
          projectId,
          geminiBody
        );

        if (response.ok) {
          const wrappedResp = await response.json();
          const geminiResp = unwrapStreamChunk(wrappedResp);
          const openaiResp = transformOpenAIResponse(geminiResp, openaiReq.model || 'gpt-4o');
          return res.json(openaiResp);
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
            error: { message: errorText, type: 'api_error' }
          });
        }

      } catch (err) {
        lastError = String(err);
        console.error('Request attempt', attempt + 1, 'failed:', err);
      }
    }

    res.status(503).json({
      error: { message: lastError || 'All accounts failed', type: 'overloaded_error' }
    });
  } catch (err) {
    console.error('Chat completions error:', err);
    res.status(500).json({
      error: { message: String(err), type: 'api_error' }
    });
  }
});

export default router;
