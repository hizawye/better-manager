// Gemini native protocol handler - Direct Gemini API compatibility

import { Router, Request, Response } from 'express';
import { tokenManager } from '../token-manager.js';
import { upstreamClient, unwrapStreamChunk } from '../upstream.js';
import { ProxyError, ProxyErrorType, calculateBackoff, sleep } from '../errors.js';
import { modelMappings, defaultModel } from '../../config/settings.js';

const router = Router();
const MAX_RETRY_ATTEMPTS = 3;

const GEMINI_MODELS = [
  'gemini-3-pro-high', 'gemini-3-pro-low', 'gemini-3-pro-image',
  'claude-opus-4-5-thinking', 'claude-sonnet-4-5-thinking', 'claude-sonnet-4-5',
];

function extractSessionId(body: any, model: string): string {
  if (body.generationConfig?.responseMimeType) {
    return 'gemini:' + body.generationConfig.responseMimeType;
  }
  const contents = body.contents || [];
  const content = contents.slice(0, 3).map((c: any) =>
    JSON.stringify(c.parts?.slice(0, 2) || [])
  ).join('|');
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash = hash & hash;
  }
  return 'gemini:' + model + ':' + Math.abs(hash).toString(36);
}

function resolveModel(requestedModel: string): string {
  if (modelMappings.custom[requestedModel]) return modelMappings.custom[requestedModel];
  if (GEMINI_MODELS.some(m => requestedModel.startsWith(m.split('-').slice(0, 2).join('-')))) return requestedModel;
  return defaultModel;
}

function formatGeminiError(error: ProxyError | Error) {
  const proxyError = error instanceof ProxyError ? error : new ProxyError(ProxyErrorType.NetworkError, error.message);
  return { error: { code: proxyError.statusCode, message: proxyError.message, status: proxyError.type } };
}

function handleCountTokens(res: Response, body: any): void {
  let totalChars = 0;
  for (const c of body.contents || []) {
    for (const part of c.parts || []) { if (part.text) totalChars += part.text.length; }
  }
  res.json({ totalTokens: Math.ceil(totalChars / 4) });
}

router.get('/models', async (_req: Request, res: Response) => {
  const models = GEMINI_MODELS.map(id => ({
    name: 'models/' + id, version: '001', displayName: id,
    description: 'Google Gemini model', inputTokenLimit: 128000, outputTokenLimit: 8192,
    supportedGenerationMethods: ['generateContent', 'countTokens', 'streamGenerateContent'],
    temperature: 1.0, topP: 0.95, topK: 64,
  }));
  res.json({ models });
});

router.get('/models/:model', async (req: Request, res: Response) => {
  const modelName = req.params.model;
  res.json({
    name: 'models/' + modelName, version: '001', displayName: modelName,
    description: 'Google Gemini model', inputTokenLimit: 128000, outputTokenLimit: 8192,
    supportedGenerationMethods: ['generateContent', 'countTokens', 'streamGenerateContent'],
    temperature: 1.0, topP: 0.95, topK: 64,
  });
});

router.post('/models/:modelAction', async (req: Request, res: Response) => {
  try {
    const modelAction = req.params.modelAction;
    let modelName: string;
    let method: string;

    if (modelAction.includes(':')) {
      const lastColon = modelAction.lastIndexOf(':');
      modelName = modelAction.substring(0, lastColon);
      method = modelAction.substring(lastColon + 1);
    } else {
      modelName = modelAction;
      method = 'generateContent';
    }

    console.log('[Gemini] model=' + modelName + ', method=' + method);

    if (method !== 'generateContent' && method !== 'streamGenerateContent' && method !== 'countTokens') {
      return res.status(400).json(formatGeminiError(new ProxyError(ProxyErrorType.InvalidRequest, 'Unsupported method')));
    }

    const body = req.body;
    const isStream = method === 'streamGenerateContent';
    const poolSize = tokenManager.size();

    if (poolSize === 0) {
      return res.status(503).json(formatGeminiError(new ProxyError(ProxyErrorType.AccountError, 'No accounts')));
    }

    if (method === 'countTokens') return handleCountTokens(res, body);

    const resolvedModel = resolveModel(modelName);
    const sessionId = extractSessionId(body, resolvedModel);
    const maxAttempts = Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, poolSize));
    let lastError: ProxyError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken('chat', attempt > 0, sessionId);
        console.log('[Gemini] Attempt ' + (attempt + 1) + ': ' + email);

        if (isStream) {
          return await handleStreamingResponse(res, resolvedModel, accessToken, projectId, email, body);
        } else {
          return await handleNonStreamingResponse(res, resolvedModel, accessToken, projectId, email, body);
        }
      } catch (err) {
        const proxyError = err instanceof ProxyError ? err : new ProxyError(ProxyErrorType.NetworkError, String(err));
        lastError = proxyError;
        if (attempt < maxAttempts - 1 && proxyError.retryable) await sleep(calculateBackoff(attempt));
      }
    }

    res.status(lastError?.statusCode ?? 503).json(formatGeminiError(lastError ?? new ProxyError(ProxyErrorType.ServerOverload, 'Failed')));
  } catch (err) {
    res.status(500).json(formatGeminiError(err instanceof ProxyError ? err : new ProxyError(ProxyErrorType.NetworkError, String(err))));
  }
});

async function handleStreamingResponse(
  res: Response, model: string, accessToken: string,
  projectId: string, email: string, body: any
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const response = await upstreamClient.callGenerateContent(
    model, 'streamGenerateContent', accessToken, projectId, body, 'alt=sse'
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
  if (!reader) throw new ProxyError(ProxyErrorType.StreamError, 'No response body');

  const decoder = new TextDecoder();
  let buffer = '';
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
          const jsonData = trimmed.substring(5).trim();
          try {
            const parsed = JSON.parse(jsonData);
            const unwrapped = unwrapStreamChunk(parsed);
            res.write('data: ' + JSON.stringify(unwrapped) + '\n\n');
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }
    res.end();
  } catch (err) {
    console.error('[Gemini] Stream error:', err);
    res.end();
  } finally {
    reader.releaseLock();
  }
}

async function handleNonStreamingResponse(
  res: Response, model: string, accessToken: string,
  projectId: string, email: string, body: any
): Promise<void> {
  const response = await upstreamClient.callGenerateContent(
    model, 'generateContent', accessToken, projectId, body
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
  res.json(geminiResp);
}

export default router;
