// Proxy types and interfaces

// Token/Account types
export interface ProxyToken {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  email: string;
  projectId?: string;
  subscriptionTier?: 'FREE' | 'PRO' | 'ULTRA';
}

// Rate limit tracking
export interface RateLimitInfo {
  until: number; // Unix timestamp when limit expires
  reason: RateLimitReason;
  retryAfter: number; // seconds
}

export enum RateLimitReason {
  QuotaExhausted = 'QUOTA_EXHAUSTED',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  AccountForbidden = 'ACCOUNT_FORBIDDEN',
  ServerError = 'SERVER_ERROR',
}

// Scheduling modes for token selection
export enum SchedulingMode {
  CacheFirst = 'cache-first', // Maximize cache hits (reuse same account)
  Balanced = 'balanced', // Balance between caching and distribution
  PerformanceFirst = 'performance-first', // Maximize throughput (rotate aggressively)
}

export interface StickySessionConfig {
  mode: SchedulingMode;
  maxWaitSeconds: number; // Max time to wait for a rate-limited account
}

// OpenAI API types
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[];
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: string };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stop?: string | string[];
  n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface OpenAIChoice {
  index: number;
  message?: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  delta?: {
    role?: string;
    content?: string | null;
    tool_calls?: Partial<OpenAIToolCall>[];
  };
  finish_reason: string | null;
}

export interface OpenAIResponse {
  id: string;
  object: 'chat.completion' | 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Claude API types
export interface ClaudeContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'thinking' | 'redacted_thinking';
  text?: string;
  source?: { type: 'base64'; media_type: string; data: string };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
  // Thinking block fields
  thinking?: string;
  signature?: string;
  cache_control?: { type: string };
  data?: string; // For redacted_thinking
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  system?: string | ClaudeContentBlock[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: { type: 'auto' | 'any' | 'tool' | 'none'; name?: string };
  stop_sequences?: string[];
  metadata?: { user_id?: string };
  thinking?: { type: 'enabled'; budget_tokens?: number } | { type: 'disabled' };
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence?: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Gemini API types
export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiTool {
  functionDeclarations?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  tools?: GeminiTool[];
  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
  index?: number;
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
}

// Proxy configuration
export interface ProxyServerConfig {
  host: string;
  port: number;
  apiKey?: string;
  requireAuth: boolean;
  schedulingMode: SchedulingMode;
  sessionStickiness: boolean;
  maxWaitSeconds: number;
  requestTimeout: number; // in seconds
  modelMappings: {
    openai: Record<string, string>;
    anthropic: Record<string, string>;
    custom: Record<string, string>;
  };
}
