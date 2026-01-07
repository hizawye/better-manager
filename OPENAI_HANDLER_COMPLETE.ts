// OpenAI protocol handler with streaming support
// Copy this to src/proxy/handlers/openai.ts

import { Router, Request, Response } from 'express';
import { tokenManager } from '../token-manager.js';
import { upstreamClient, unwrapStreamChunk } from '../upstream.js';
import { transformOpenAIRequest, transformOpenAIResponse, transformOpenAIStreamChunk } from '../mappers/openai.js';
import { OpenAIRequest } from '../types.js';
import crypto from 'crypto';

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

router.get('/models', async (_req: Request, res: Response) => {
  const models = Object.keys(MODEL_MAPPING).map(id => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'openai',
  }));
  res.json({ object: 'list', data: models });
});

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
    const stream = openaiReq.stream ?? false;
    let lastError = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken('chat', attempt > 0, sessionId);
        console.log('Using account:', email, 'for OpenAI model:', openaiReq.model, 'stream:', stream);

        const geminiBody = transformOpenAIRequest(openaiReq, mappedModel);

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

            const errorData = JSON.stringify({ error: { message: errorText, type: 'api_error' } });
            res.write('data: ' + errorData + '\n\n');
            res.end();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            const errorData = JSON.stringify({ error: { message: 'No response body', type: 'api_error' } });
            res.write('data: ' + errorData + '\n\n');
            res.end();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          const chunkId = 'chatcmpl-' + crypto.randomBytes(12).toString('hex');

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
                  } catch (e) {
                    // Skip malformed chunks
                  }
                }
              }
            }

            // Send final chunk
            const finalChunk = { id: chunkId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: openaiReq.model || 'gpt-4o', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
            res.write('data: ' + JSON.stringify(finalChunk) + '\n\n');
            res.write('data: 
