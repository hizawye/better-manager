// Background task detection for smart routing
// Routes low-value tasks to cheaper models to save quota

import { ClaudeMessage, OpenAIMessage } from '../types.js';

// Patterns that indicate a background/utility task
const BACKGROUND_PATTERNS = [
  // Title generation patterns (from Antigravity)
  /write\s+a\s+\d+-\d+\s+word\s+title/i,
  /please\s+write\s+a\s+\d+-\d+\s+word\s+title/i,
  /respond\s+with\s+the\s+title/i,
  /generate\s+a?\s*title\s+for/i,
  /create\s+a\s+brief\s+title/i,
  /title\s+for\s+the\s+conversation/i,
  /conversation\s+title/i,

  // Summary generation patterns (from Antigravity)
  /summarize\s+this\s+coding\s+conversation/i,
  /summarize\s+(this|the)\s+(conversation|chat)/i,
  /concise\s+summary/i,
  /in\s+under\s+\d+\s+characters/i,
  /compress\s+the\s+context/i,
  /provide\s+a\s+concise\s+summary/i,
  /condense\s+the\s+previous\s+messages/i,
  /shorten\s+the\s+conversation\s+history/i,
  /extract\s+key\s+points\s+from/i,

  // Suggestion generation patterns (from Antigravity)
  /prompt\s+suggestion\s+generator/i,
  /suggest\s+next\s+prompts?/i,
  /what\s+should\s+i\s+ask\s+next/i,
  /generate\s+follow-?up\s+questions/i,
  /recommend\s+next\s+steps/i,
  /possible\s+next\s+actions/i,

  // System/warmup messages (from Antigravity)
  /^warmup$/i,

  // Agent auto-tasks
  /next\s+prompt\s+suggestions?/i,
  /generate_title/i,

  // Metadata tasks
  /extract\s+(keywords?|tags?|topics?)/i,
  /classify\s+(this|the)\s+(message|content)/i,

  // Simple formatting tasks
  /format\s+(this|the)\s+(text|code)/i,
  /convert\s+to\s+(json|yaml|markdown)/i,
];

// Patterns that indicate this is NOT a background task
// (even if it matches some patterns above)
const NON_BACKGROUND_PATTERNS = [
  /write\s+a\s+(detailed|comprehensive|full)/i,
  /explain\s+(in\s+detail|thoroughly)/i,
  /analyze\s+(this|the)/i,
  /implement/i,
  /create\s+a\s+(function|class|component)/i,
  /debug/i,
  /fix/i,
  /refactor/i,
];

/**
 * Check if a message content matches background task patterns
 */
function matchesBackgroundPattern(content: string): boolean {
  // Check if any background pattern matches
  const isBackground = BACKGROUND_PATTERNS.some(pattern => pattern.test(content));
  if (!isBackground) return false;

  // Make sure it's not actually a complex task
  const isComplex = NON_BACKGROUND_PATTERNS.some(pattern => pattern.test(content));
  return !isComplex;
}

/**
 * Extract text content from Claude message
 */
function extractClaudeMessageText(message: ClaudeMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join(' ');
}

/**
 * Extract text content from OpenAI message
 */
function extractOpenAIMessageText(message: OpenAIMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter(part => part.type === 'text')
      .map(part => part.text || '')
      .join(' ');
  }
  return '';
}

/**
 * Detect if a Claude request is a background task
 */
export function isClaudeBackgroundTask(messages: ClaudeMessage[]): boolean {
  if (messages.length === 0) return false;

  // Check the last few messages (usually the task is in recent messages)
  const recentMessages = messages.slice(-3);

  for (const message of recentMessages) {
    const text = extractClaudeMessageText(message);
    if (matchesBackgroundPattern(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect if an OpenAI request is a background task
 */
export function isOpenAIBackgroundTask(messages: OpenAIMessage[]): boolean {
  if (messages.length === 0) return false;

  // Check the last few messages
  const recentMessages = messages.slice(-3);

  for (const message of recentMessages) {
    const text = extractOpenAIMessageText(message);
    if (matchesBackgroundPattern(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if request contains vision/image content
 */
export function hasVisionContent(messages: ClaudeMessage[] | OpenAIMessage[]): boolean {
  for (const message of messages) {
    if (typeof message.content === 'string') continue;

    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        // Claude image block
        if ('type' in block && block.type === 'image') {
          return true;
        }
        // OpenAI image_url block
        if ('type' in block && block.type === 'image_url') {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Estimate message complexity based on length and patterns
 */
export function estimateComplexity(messages: ClaudeMessage[] | OpenAIMessage[]): 'low' | 'medium' | 'high' {
  let totalLength = 0;
  let hasTools = false;
  let hasImages = false;
  let messageCount = messages.length;

  for (const message of messages) {
    if (typeof message.content === 'string') {
      totalLength += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if ('text' in block && block.text) {
          totalLength += block.text.length;
        }
        if ('type' in block) {
          if (block.type === 'image' || block.type === 'image_url') {
            hasImages = true;
          }
          if (block.type === 'tool_use' || block.type === 'tool_result') {
            hasTools = true;
          }
        }
      }
    }

    // Check for tool calls in OpenAI format
    if ('tool_calls' in message && message.tool_calls) {
      hasTools = true;
    }
  }

  // High complexity: long context, tools, or images
  if (totalLength > 50000 || hasTools || hasImages || messageCount > 20) {
    return 'high';
  }

  // Medium complexity: moderate context
  if (totalLength > 10000 || messageCount > 10) {
    return 'medium';
  }

  // Low complexity
  return 'low';
}
