// OpenAI to Gemini request/response mappers

import {
  OpenAIRequest,
  OpenAIResponse,
  OpenAIMessage,
  OpenAIContentPart,
  GeminiRequest,
  GeminiResponse,
  GeminiContent,
  GeminiPart,
} from '../types.js';

/**
 * Generate a unique ID for responses
 */
function generateId(): string {
  return 'chatcmpl-' + Math.random().toString(36).substring(2, 15);
}

/**
 * Convert OpenAI message content to Gemini parts
 */
function convertContent(content: string | OpenAIContentPart[] | undefined): GeminiPart[] {
  if (!content) return [{ text: '' }];

  if (typeof content === 'string') {
    return [{ text: content }];
  }

  return content.map(part => {
    if (part.type === 'text') {
      return { text: part.text ?? '' };
    } else if (part.type === 'image_url' && part.image_url) {
      // Handle image URLs
      const url = part.image_url.url;
      if (url.startsWith('data:')) {
        // Base64 encoded image
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return {
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          };
        }
      }
      // For external URLs, we'd need to fetch and convert
      // For now, treat as text placeholder
      return { text: `[Image: ${url}]` };
    }
    return { text: '' };
  });
}

/**
 * Convert OpenAI role to Gemini role
 */
function convertRole(role: string): 'user' | 'model' {
  switch (role) {
    case 'assistant':
      return 'model';
    case 'system':
    case 'user':
    case 'tool':
    default:
      return 'user';
  }
}

/**
 * Extract system message from OpenAI messages
 */
function extractSystemMessage(messages: OpenAIMessage[]): string | undefined {
  const systemMessages = messages.filter(m => m.role === 'system');
  if (systemMessages.length === 0) return undefined;

  return systemMessages
    .map(m => (typeof m.content === 'string' ? m.content : ''))
    .join('\n\n');
}

/**
 * Strip unsupported fields from tool schema for Gemini compatibility
 * Gemini only supports a subset of JSON Schema: type, properties, required, enum, items, description
 */
function cleanToolSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema) return undefined;

  // Fields that Gemini supports
  const SUPPORTED_FIELDS = new Set([
    'type',
    'properties',
    'required',
    'enum',
    'items',
    'description',
    'format',
    'minimum',
    'maximum',
    'minItems',
    'maxItems',
    'nullable',
  ]);

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported fields
    if (!SUPPORTED_FIELDS.has(key)) continue;

    // Recursively clean nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = cleanToolSchema(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map(item =>
        item && typeof item === 'object' ? cleanToolSchema(item as Record<string, unknown>) : item
      );
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Transform OpenAI request to Gemini request
 */
export function transformOpenAIRequest(
  req: OpenAIRequest,
  mappedModel: string
): GeminiRequest {
  // Extract system message
  const systemMessage = extractSystemMessage(req.messages);

  // Convert messages (excluding system messages)
  const contents: GeminiContent[] = [];
  let lastRole: 'user' | 'model' | null = null;

  for (const msg of req.messages) {
    if (msg.role === 'system') continue;

    const role = convertRole(msg.role);
    const parts = convertContent(msg.content);

    // Handle tool calls in assistant messages
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args,
            },
          });
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    // Handle tool results
    if (msg.role === 'tool' && msg.tool_call_id && msg.content) {
      try {
        const response = typeof msg.content === 'string'
          ? JSON.parse(msg.content)
          : msg.content;
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: msg.name ?? 'function',
              response,
            },
          }],
        });
        lastRole = 'user';
        continue;
      } catch {
        // Not valid JSON, treat as text
      }
    }

    // Enforce role alternation
    if (role === lastRole && contents.length > 0) {
      // Merge with previous content
      contents[contents.length - 1].parts.push(...parts);
    } else {
      contents.push({ role, parts });
      lastRole = role;
    }
  }

  // Build Gemini request
  const geminiReq: GeminiRequest = {
    contents,
  };

  // Add system instruction
  if (systemMessage) {
    geminiReq.systemInstruction = {
      parts: [{ text: systemMessage }],
    };
  }

  // Add generation config
  geminiReq.generationConfig = {};
  if (req.temperature !== undefined) {
    geminiReq.generationConfig.temperature = req.temperature;
  }
  if (req.top_p !== undefined) {
    geminiReq.generationConfig.topP = req.top_p;
  }
  if (req.max_tokens !== undefined) {
    geminiReq.generationConfig.maxOutputTokens = req.max_tokens;
  }
  if (req.stop) {
    geminiReq.generationConfig.stopSequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  }

  // Add tools if present
  if (req.tools && req.tools.length > 0) {
    geminiReq.tools = [{
      functionDeclarations: req.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: cleanToolSchema(tool.function.parameters),
      })),
    }];

    // Handle tool_choice
    if (req.tool_choice) {
      geminiReq.toolConfig = { functionCallingConfig: {} };
      if (req.tool_choice === 'none') {
        geminiReq.toolConfig.functionCallingConfig!.mode = 'NONE';
      } else if (req.tool_choice === 'auto') {
        geminiReq.toolConfig.functionCallingConfig!.mode = 'AUTO';
      } else if (typeof req.tool_choice === 'object') {
        geminiReq.toolConfig.functionCallingConfig!.mode = 'ANY';
        geminiReq.toolConfig.functionCallingConfig!.allowedFunctionNames = [
          req.tool_choice.function.name,
        ];
      }
    }
  }

  return geminiReq;
}

/**
 * Transform Gemini response to OpenAI response
 */
export function transformOpenAIResponse(
  geminiResp: GeminiResponse,
  model: string
): OpenAIResponse {
  const candidate = geminiResp.candidates?.[0];

  if (!candidate) {
    return {
      id: generateId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '' },
        finish_reason: 'stop',
      }],
    };
  }

  // Extract text content and tool calls
  let textContent = '';
  const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];

  for (const part of candidate.content.parts) {
    if (part.text) {
      textContent += part.text;
    }
    if (part.functionCall) {
      toolCalls.push({
        id: 'call_' + Math.random().toString(36).substring(2, 11),
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        },
      });
    }
  }

  // Map finish reason
  let finishReason = 'stop';
  if (candidate.finishReason) {
    switch (candidate.finishReason) {
      case 'STOP':
        finishReason = 'stop';
        break;
      case 'MAX_TOKENS':
        finishReason = 'length';
        break;
      case 'SAFETY':
        finishReason = 'content_filter';
        break;
      case 'RECITATION':
        finishReason = 'content_filter';
        break;
      default:
        finishReason = 'stop';
    }
  }

  const response: OpenAIResponse = {
    id: generateId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: toolCalls.length > 0 ? null : textContent,
        ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      },
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : finishReason,
    }],
  };

  // Add usage if available
  if (geminiResp.usageMetadata) {
    response.usage = {
      prompt_tokens: geminiResp.usageMetadata.promptTokenCount ?? 0,
      completion_tokens: geminiResp.usageMetadata.candidatesTokenCount ?? 0,
      total_tokens: geminiResp.usageMetadata.totalTokenCount ?? 0,
    };
  }

  return response;
}

/**
 * Transform Gemini SSE chunk to OpenAI SSE format
 */
export function transformOpenAIStreamChunk(
  chunk: GeminiResponse,
  model: string,
  chunkId: string
): OpenAIResponse {
  const candidate = chunk.candidates?.[0];

  let deltaContent: string | undefined;
  const deltaToolCalls: Partial<{ id: string; type: 'function'; function: { name: string; arguments: string } }>[] = [];

  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) {
        deltaContent = (deltaContent ?? '') + part.text;
      }
      if (part.functionCall) {
        deltaToolCalls.push({
          id: 'call_' + Math.random().toString(36).substring(2, 11),
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        });
      }
    }
  }

  let finishReason: string | null = null;
  if (candidate?.finishReason) {
    switch (candidate.finishReason) {
      case 'STOP':
        finishReason = 'stop';
        break;
      case 'MAX_TOKENS':
        finishReason = 'length';
        break;
      default:
        finishReason = 'stop';
    }
  }

  return {
    id: chunkId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: {
        ...(deltaContent !== undefined && { content: deltaContent }),
        ...(deltaToolCalls.length > 0 && { tool_calls: deltaToolCalls }),
      },
      finish_reason: finishReason,
    }],
  };
}
