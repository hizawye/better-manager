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

// Minimum signature length for a valid thinking block
const MIN_SIGNATURE_LENGTH = 10;

/**
 * Generate a unique ID for responses
 */
function generateId(): string {
  return 'msg_' + Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/**
 * Check if a thinking block has a valid signature
 * Vertex AI / Gemini requires valid signatures for thinking blocks
 */
function hasValidSignature(block: ClaudeContentBlock): boolean {
  if (block.type !== 'thinking') return true;

  // Empty thinking + any signature = valid (trailing signature case)
  if (!block.thinking && block.signature) return true;

  // Has content + sufficient signature length = valid
  return Boolean(block.signature && block.signature.length >= MIN_SIGNATURE_LENGTH);
}

/**
 * Sanitize a thinking block by removing cache_control
 */
function sanitizeThinkingBlock(block: ClaudeContentBlock): ClaudeContentBlock {
  if (block.type !== 'thinking') return block;

  return {
    type: 'thinking',
    thinking: block.thinking,
    signature: block.signature,
  };
}

/**
 * Filter invalid thinking blocks from messages
 * This prevents "Invalid signature" errors from Gemini
 */
export function filterInvalidThinkingBlocks(messages: ClaudeMessage[]): number {
  let totalFiltered = 0;

  for (const msg of messages) {
    // Only process assistant messages
    if (msg.role !== 'assistant') continue;

    if (!Array.isArray(msg.content)) continue;

    const originalLen = msg.content.length;
    const newBlocks: ClaudeContentBlock[] = [];

    for (const block of msg.content) {
      if (block.type === 'thinking') {
        if (hasValidSignature(block)) {
          newBlocks.push(sanitizeThinkingBlock(block));
        } else {
          // Convert thinking with invalid signature to text, preserving content
          if (block.thinking && block.thinking.length > 0) {
            console.log(`[Claude] Converting invalid thinking block to text (${block.thinking.length} chars)`);
            newBlocks.push({ type: 'text', text: block.thinking });
          }
        }
      } else if (block.type === 'redacted_thinking') {
        // Skip redacted thinking blocks entirely - Gemini doesn't support them
        console.log('[Claude] Removing redacted_thinking block');
      } else {
        newBlocks.push(block);
      }
    }

    // Ensure message has at least one content block
    if (newBlocks.length === 0) {
      newBlocks.push({ type: 'text', text: '' });
    }

    msg.content = newBlocks;
    totalFiltered += originalLen - newBlocks.length;
  }

  if (totalFiltered > 0) {
    console.log(`[Claude] Filtered ${totalFiltered} invalid thinking block(s) from history`);
  }

  return totalFiltered;
}

/**
 * Remove trailing unsigned thinking blocks from content
 */
function removeTrailingUnsignedThinking(blocks: ClaudeContentBlock[]): void {
  if (blocks.length === 0) return;

  // Scan backwards and remove unsigned thinking blocks at the end
  let endIndex = blocks.length;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === 'thinking') {
      if (!hasValidSignature(blocks[i])) {
        endIndex = i;
      } else {
        break; // Stop at valid thinking block
      }
    } else {
      break; // Stop at non-thinking block
    }
  }

  if (endIndex < blocks.length) {
    const removed = blocks.length - endIndex;
    blocks.splice(endIndex);
    console.log(`[Claude] Removed ${removed} trailing unsigned thinking block(s)`);
  }
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

    case 'thinking':
      // Convert valid thinking blocks to text for Gemini
      // The thinking content is useful context even if Gemini doesn't have native thinking
      if (block.thinking) {
        return { text: `<thinking>${block.thinking}</thinking>` };
      }
      return null;

    case 'redacted_thinking':
      // Skip redacted thinking entirely
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
 * Strip unsupported fields from tool schema for Gemini compatibility
 * Gemini only supports a subset of JSON Schema: type, properties, required, enum, items, description
 */
function cleanToolSchema(schema: Record<string, unknown>): Record<string, unknown> {
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
 * Transform Claude request to Gemini request
 */
export function transformClaudeRequest(
  req: ClaudeRequest,
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
    let systemText: string;
    if (typeof req.system === 'string') {
      systemText = req.system;
    } else if (Array.isArray(req.system)) {
      // Handle array of content blocks (Claude Code format)
      systemText = req.system
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join('\n');
    } else {
      systemText = '';
    }

    if (systemText) {
      geminiReq.systemInstruction = {
        parts: [{ text: systemText }],
      };
    }
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
        parameters: cleanToolSchema(tool.input_schema),
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
