// MCP (Model Context Protocol) handler
// Provides tool use and function calling capabilities

import { Router, Request, Response } from 'express';
import { tokenManager } from '../token-manager.js';
import { upstreamClient, unwrapStreamChunk } from '../upstream.js';
import { ProxyError, ProxyErrorType, calculateBackoff, sleep } from '../errors.js';
import { modelMappings, defaultModel } from '../../config/settings.js';

const router = Router();
const MAX_RETRY_ATTEMPTS = 3;

interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface MCPRequest {
  model?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string | Array<{ type: string; text?: string; tool_use_id?: string; name?: string; input?: unknown }>;
  }>;
  tools?: MCPToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'tool'; name: string };
  max_tokens?: number;
  stream?: boolean;
}

function resolveModel(requestedModel?: string): string {
  if (!requestedModel) return defaultModel;
  if (modelMappings.custom[requestedModel]) {
    return modelMappings.custom[requestedModel];
  }
  return defaultModel;
}

function formatError(error: ProxyError | Error) {
  const proxyError = error instanceof ProxyError 
    ? error 
    : new ProxyError(ProxyErrorType.NetworkError, error.message);
  return {
    error: {
      type: proxyError.type,
      message: proxyError.message,
    },
  };
}

// Transform MCP tools to Gemini function declarations
function transformToolsToGemini(tools?: MCPToolDefinition[]): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }];
}

// Transform MCP messages to Gemini format
function transformMessagesToGemini(messages: MCPRequest['messages']): any[] {
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const role = msg.role === 'user' ? 'user' : 'model';
    const parts: any[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_result' && block.tool_use_id) {
          parts.push({
            functionResponse: {
              name: block.name || block.tool_use_id,
              response: { content: block.text || '' },
            },
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return contents;
}

// Transform Gemini response to MCP format
function transformGeminiToMCP(geminiResp: any, model: string): any {
  const content: any[] = [];
  let stopReason: string | null = null;

  if (geminiResp.candidates?.[0]) {
    const candidate = geminiResp.candidates[0];
    const parts = candidate.content?.parts || [];

    for (const part of parts) {
      if (part.text) {
        content.push({ type: 'text', text: part.text });
      }
      if (part.functionCall) {
        const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        content.push({
          type: 'tool_use',
          id: callId,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        });
        stopReason = 'tool_use';
      }
    }

    if (!stopReason) {
      stopReason = candidate.finishReason === 'STOP' ? 'end_turn' : 'max_tokens';
    }
  }

  return {
    id: 'msg_' + Date.now(),
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    usage: {
      input_tokens: geminiResp.usageMetadata?.promptTokenCount || 0,
      output_tokens: geminiResp.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

// Extract system message
function extractSystemMessage(messages: MCPRequest['messages']): string | undefined {
  const systemMsg = messages.find(m => m.role === 'system');
  if (!systemMsg) return undefined;
  return typeof systemMsg.content === 'string' 
    ? systemMsg.content 
    : systemMsg.content.find(b => b.type === 'text')?.text;
}

// Main messages endpoint
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const body: MCPRequest = req.body;
    const resolvedModel = resolveModel(body.model);
    const poolSize = tokenManager.size();

    if (poolSize === 0) {
      return res.status(503).json(formatError(
        new ProxyError(ProxyErrorType.AccountError, 'No accounts available')
      ));
    }

    const systemInstruction = extractSystemMessage(body.messages);
    const contents = transformMessagesToGemini(body.messages);
    const tools = transformToolsToGemini(body.tools);

    const geminiBody: any = {
      contents,
      generationConfig: {
        maxOutputTokens: body.max_tokens || 4096,
      },
    };

    if (systemInstruction) {
      geminiBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools) {
      geminiBody.tools = tools;
    }

    const maxAttempts = Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, poolSize));
    let lastError: ProxyError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { accessToken, projectId, email } = await tokenManager.getToken('chat', attempt > 0);
        console.log('[MCP] Attempt ' + (attempt + 1) + ': ' + email);

        const response = await upstreamClient.callGenerateContent(
          resolvedModel,
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
        const mcpResp = transformGeminiToMCP(geminiResp, body.model || 'claude-3-opus');

        return res.json(mcpResp);
      } catch (err) {
        const proxyError = err instanceof ProxyError 
          ? err 
          : new ProxyError(ProxyErrorType.NetworkError, String(err));
        lastError = proxyError;

        if (attempt < maxAttempts - 1 && proxyError.retryable) {
          await sleep(calculateBackoff(attempt));
        }
      }
    }

    res.status(lastError?.statusCode ?? 503).json(formatError(
      lastError ?? new ProxyError(ProxyErrorType.ServerOverload, 'All accounts failed')
    ));
  } catch (err) {
    res.status(500).json(formatError(
      err instanceof ProxyError ? err : new ProxyError(ProxyErrorType.NetworkError, String(err))
    ));
  }
});

// List available tools endpoint
router.get('/tools', async (_req: Request, res: Response) => {
  res.json({
    tools: [],
    message: 'Tool discovery not implemented. Tools should be provided in the request.',
  });
});

export default router;
