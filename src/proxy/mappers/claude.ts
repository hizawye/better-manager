// Claude to Gemini request/response mappers

import {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeMessage,
  ClaudeContentBlock,
  GeminiRequest,
  GeminiResponse,
  GeminiContent,
  GeminiPart,
} from '../types.js';

/**
 * Generate a unique ID for responses
 */
function generateId(): string {
  return 'msg_' + Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/**
 * Convert Claude content block to Gemini part
 */
function convertContentBlock(block: ClaudeContentBlock): GeminiPart | null {
  switch (block.type) {
    case 'text':
      return { text: block.text ?? '' };

    case 'image':
      if (block.source?.type === 'base64') {
        return {
          inlineData: {
            mimeType: block.source.media_type,
            data: block.source.data,
          },
        };
      }
      return null;

    case 'tool_use':
      if (block.name && block.input) {
        return {
          functionCall: {
            name: block.name,
            args: block.input,
          },
        };
      }
      return null;

    case 'tool_result':
      if (block.tool_use_id && block.content) {
        const responseContent = typeof block.content === 'string'
          ? { result: block.content }
          : Array.isArray(block.content)
            ? { result: block.content.map(c => c.text ?? '').join('') }
            : block.content;

        return {
          functionResponse: {
            name: block.tool_use_id, // We'll need to map this to actual function name
            response: responseContent as Record<string, unknown>,
          },
        };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Convert Claude message content to Gemini parts
 */
function convertMessageContent(content: string | ClaudeContentBlock[]): GeminiPart[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }

  return content
    .map(convertContentBlock)
    .filter((p): p is GeminiPart => p !== null);
}

/**
 * Convert Claude role to Gemini role
 */
function convertRole(role: 'user' | 'assistant'): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

/**
 * Transform Claude request to Gemini request
 */
export function transformClaudeRequest(
  req: ClaudeRequest,
  projectId: string,
  mappedModel: string
): GeminiRequest {
  // Convert messages
  const contents: GeminiContent[] = [];
  let lastRole: 'user' | 'model' | null = null;

  for (const msg of req.messages) {
    const role = convertRole(msg.role);
    const parts = convertMessageContent(msg.content);

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
  if (req.system) {
    geminiReq.systemInstruction = {
      parts: [{ text: req.system }],
    };
  }

  // Add generation config
  geminiReq.generationConfig = {
    maxOutputTokens: req.max_tokens,
  };

  if (req.temperature !== undefined) {
    geminiReq.generationConfig.temperature = req.temperature;
  }
  if (req.top_p !== undefined) {
    geminiReq.generationConfig.topP = req.top_p;
  }
  if (req.top_k !== undefined) {
    geminiReq.generationConfig.topK = req.top_k;
  }
  if (req.stop_sequences && req.stop_sequences.length > 0) {
    geminiReq.generationConfig.stopSequences = req.stop_sequences;
  }

  // Add tools if present
  if (req.tools && req.tools.length > 0) {
    geminiReq.tools = [{
      functionDeclarations: req.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      })),
    }];

    // Handle tool_choice
    if (req.tool_choice) {
      geminiReq.toolConfig = { functionCallingConfig: {} };
      if (req.tool_choice.type === 'none') {
        geminiReq.tools = undefined; // Remove tools
      } else if (req.tool_choice.type === 'auto') {
        geminiReq.toolConfig.functionCallingConfig!.mode = 'AUTO';
      } else if (req.tool_choice.type === 'any') {
        geminiReq.toolConfig.functionCallingConfig!.mode = 'ANY';
      } else if (req.tool_choice.type === 'tool' && req.tool_choice.name) {
        geminiReq.toolConfig.functionCallingConfig!.mode = 'ANY';
        geminiReq.toolConfig.functionCallingConfig!.allowedFunctionNames = [
          req.tool_choice.name,
        ];
      }
    }
  }

  return geminiReq;
}

/**
 * Transform Gemini response to Claude response
 */
export function transformClaudeResponse(
  geminiResp: GeminiResponse,
  model: string
): ClaudeResponse {
  const candidate = geminiResp.candidates?.[0];

  if (!candidate) {
    return {
      id: generateId(),
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  // Convert Gemini parts to Claude content blocks
  const content: ClaudeContentBlock[] = [];

  for (const part of candidate.content.parts) {
    if (part.text) {
      content.push({ type: 'text', text: part.text });
    }
    if (part.functionCall) {
      content.push({
        type: 'tool_use',
        id: 'toolu_' + Math.random().toString(36).substring(2, 11),
        name: part.functionCall.name,
        input: part.functionCall.args,
      });
    }
  }

  // Map finish reason
  let stopReason: ClaudeResponse['stop_reason'] = 'end_turn';
  if (candidate.finishReason) {
    switch (candidate.finishReason) {
      case 'STOP':
        // Check if we have tool_use blocks
        if (content.some(c => c.type === 'tool_use')) {
          stopReason = 'tool_use';
        } else {
          stopReason = 'end_turn';
        }
        break;
      case 'MAX_TOKENS':
        stopReason = 'max_tokens';
        break;
      case 'SAFETY':
      case 'RECITATION':
        stopReason = 'end_turn'; // Claude doesn't have content_filter
        break;
      default:
        stopReason = 'end_turn';
    }
  }

  return {
    id: generateId(),
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    usage: {
      input_tokens: geminiResp.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: geminiResp.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/**
 * Create Claude SSE event from Gemini chunk
 */
export function createClaudeStreamEvent(
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop',
  data: Record<string, unknown>
): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Transform Gemini streaming response to Claude SSE format
 */
export function* transformClaudeStreamChunk(
  chunk: GeminiResponse,
  model: string,
  messageId: string,
  blockIndex: { current: number }
): Generator<string> {
  const candidate = chunk.candidates?.[0];

  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) {
        // Content block delta
        yield createClaudeStreamEvent('content_block_delta', {
          type: 'content_block_delta',
          index: blockIndex.current,
          delta: { type: 'text_delta', text: part.text },
        });
      }

      if (part.functionCall) {
        // Tool use block
        blockIndex.current++;
        yield createClaudeStreamEvent('content_block_start', {
          type: 'content_block_start',
          index: blockIndex.current,
          content_block: {
            type: 'tool_use',
            id: 'toolu_' + Math.random().toString(36).substring(2, 11),
            name: part.functionCall.name,
            input: {},
          },
        });

        yield createClaudeStreamEvent('content_block_delta', {
          type: 'content_block_delta',
          index: blockIndex.current,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify(part.functionCall.args),
          },
        });
      }
    }
  }

  // Check for finish reason
  if (candidate?.finishReason) {
    let stopReason: string = 'end_turn';
    switch (candidate.finishReason) {
      case 'STOP':
        stopReason = 'end_turn';
        break;
      case 'MAX_TOKENS':
        stopReason = 'max_tokens';
        break;
    }

    // Close current content block
    yield createClaudeStreamEvent('content_block_stop', {
      type: 'content_block_stop',
      index: blockIndex.current,
    });

    // Message delta with stop reason
    yield createClaudeStreamEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: {
        output_tokens: chunk.usageMetadata?.candidatesTokenCount ?? 0,
      },
    });

    // Message stop
    yield createClaudeStreamEvent('message_stop', {
      type: 'message_stop',
    });
  }
}
