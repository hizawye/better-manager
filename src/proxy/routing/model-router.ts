// Smart model routing with three-layer mapping system

import { modelMappings, backgroundTaskModel, defaultModel } from '../../config/settings.js';
import { ClaudeMessage, OpenAIMessage, ClaudeRequest, OpenAIRequest } from '../types.js';
import { isClaudeBackgroundTask, isOpenAIBackgroundTask, hasVisionContent } from './background-detector.js';

export interface RoutingResult {
  model: string;
  reason: string;
  isBackground: boolean;
  requiresVision: boolean;
  requiresThinking: boolean;
}

// Default model mappings for Claude (built-in fallback)
const DEFAULT_CLAUDE_MAPPING: Record<string, string> = {
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4-5',
  'claude-3-5-sonnet': 'claude-sonnet-4-5',
  'claude-3-sonnet-20240229': 'gemini-3-pro-low',
  'claude-3-sonnet': 'gemini-3-pro-low',
  'claude-3-opus-20240229': 'gemini-3-pro-high',
  'claude-3-opus': 'gemini-3-pro-high',
  'claude-3-haiku-20240307': 'gemini-3-pro-low',
  'claude-3-5-haiku': 'gemini-3-pro-low',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-5',
  'claude-opus-4-20250514': 'claude-opus-4-5-thinking',
  'claude-opus-4-5-20251101': 'claude-opus-4-5-thinking',
};

// Default model mappings for OpenAI (built-in fallback)
const DEFAULT_OPENAI_MAPPING: Record<string, string> = {
  'gpt-4': 'gemini-3-pro-high',
  'gpt-4-turbo': 'gemini-3-pro-high',
  'gpt-4o': 'gemini-3-pro-low',
  'gpt-4o-mini': 'gemini-3-pro-low',
  'gpt-3.5-turbo': 'gemini-3-pro-low',
  'o1': 'gemini-3-pro-high',
  'o1-mini': 'gemini-3-pro-low',
  'o1-preview': 'gemini-3-pro-high',
};

// Thinking-capable model suffixes
const THINKING_SUFFIX = '-thinking';

// Models that support thinking mode
const THINKING_MODELS = [
  'claude-opus-4-5-thinking',
  'claude-sonnet-4-5-thinking',
];

// Map base models to their thinking variants
const THINKING_MODEL_MAP: Record<string, string> = {
  'gemini-3-pro-high': 'claude-opus-4-5-thinking',
  'gemini-3-pro-low': 'claude-sonnet-4-5-thinking',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-thinking',
  'claude-opus-4-5-thinking': 'claude-opus-4-5-thinking',
};

// Vision-capable models
const VISION_MODELS = [
  'gemini-3-pro-image',
  'gemini-3-pro-high',
  'gemini-3-pro-low',
];

/**
 * Three-layer model resolution:
 * 1. Custom user-defined mappings (highest priority)
 * 2. Protocol-specific mappings (Claude/OpenAI → Gemini)
 * 3. Built-in default mappings (fallback)
 */
function resolveModelName(
  requestedModel: string,
  protocolMappings: Record<string, string>,
  defaultMappings: Record<string, string>
): { model: string; layer: string } {
  // Layer 1: Custom user-defined mappings
  if (modelMappings.custom[requestedModel]) {
    return { model: modelMappings.custom[requestedModel], layer: 'custom' };
  }

  // Layer 2: Protocol-specific mappings from config
  if (protocolMappings[requestedModel]) {
    return { model: protocolMappings[requestedModel], layer: 'protocol' };
  }

  // Layer 3: Built-in default mappings
  if (defaultMappings[requestedModel]) {
    return { model: defaultMappings[requestedModel], layer: 'default' };
  }

  // If model starts with 'gemini-', pass through directly
  if (requestedModel.startsWith('gemini-')) {
    return { model: requestedModel, layer: 'passthrough' };
  }

  // Ultimate fallback
  return { model: defaultModel, layer: 'fallback' };
}

/**
 * Check if thinking mode is requested
 */
function requiresThinking(req: ClaudeRequest): boolean {
  // Check for thinking parameter (Claude-style)
  if ('thinking' in req && req.thinking) {
    return true;
  }

  // Check for thinking in metadata
  if (req.metadata && 'thinking' in req.metadata) {
    return true;
  }

  // Check if model name includes thinking
  if (req.model.includes('thinking')) {
    return true;
  }

  return false;
}

/**
 * Ensure model supports thinking if required
 */
function ensureThinkingModel(model: string): string {
  if (model.endsWith(THINKING_SUFFIX)) {
    return model;
  }

  // Check if there's a known thinking variant for this model
  const thinkingVariant = THINKING_MODEL_MAP[model];
  if (thinkingVariant) {
    return thinkingVariant;
  }

  // Default to sonnet-thinking since it's more widely available
  return 'claude-sonnet-4-5-thinking';
}

/**
 * Get fallback model for when primary fails
 */
export function getFallbackModel(model: string): string | null {
  // Remove thinking suffix for fallback
  if (model.endsWith(THINKING_SUFFIX)) {
    return model.slice(0, -THINKING_SUFFIX.length);
  }

  // Tier fallbacks
  const fallbacks: Record<string, string> = {
    'claude-opus-4-5-thinking': 'gemini-3-pro-high',
    'claude-sonnet-4-5-thinking': 'claude-sonnet-4-5',
    'claude-sonnet-4-5': 'gemini-3-pro-low',
    'gemini-3-pro-high': 'gemini-3-pro-low',
  };

  return fallbacks[model] || null;
}

/**
 * Route Claude request to appropriate Gemini model
 */
export function routeClaudeRequest(req: ClaudeRequest): RoutingResult {
  const isBackground = isClaudeBackgroundTask(req.messages);
  const needsVision = hasVisionContent(req.messages);
  const needsThinking = requiresThinking(req);

  // Background tasks go to cheap model
  if (isBackground && !needsVision && !needsThinking) {
    return {
      model: backgroundTaskModel,
      reason: 'Background task detected, routing to lite model',
      isBackground: true,
      requiresVision: false,
      requiresThinking: false,
    };
  }

  // Resolve model through three-layer system
  const { model, layer } = resolveModelName(
    req.model,
    modelMappings.anthropic,
    DEFAULT_CLAUDE_MAPPING
  );

  let finalModel = model;
  let reason = `Mapped from ${req.model} via ${layer}`;

  // Ensure thinking model if needed
  if (needsThinking) {
    finalModel = ensureThinkingModel(finalModel);
    reason += ' (thinking mode)';
  }

  // Verify vision capability if needed
  if (needsVision && !VISION_MODELS.some(vm => finalModel.startsWith(vm))) {
    // Switch to a vision-capable model
    finalModel = 'gemini-3-pro-image';
    reason += ' (upgraded for vision)';
  }

  return {
    model: finalModel,
    reason,
    isBackground: false,
    requiresVision: needsVision,
    requiresThinking: needsThinking,
  };
}

/**
 * Route OpenAI request to appropriate Gemini model
 */
export function routeOpenAIRequest(req: OpenAIRequest): RoutingResult {
  const isBackground = isOpenAIBackgroundTask(req.messages);
  const needsVision = hasVisionContent(req.messages);

  // Background tasks go to cheap model
  if (isBackground && !needsVision) {
    return {
      model: backgroundTaskModel,
      reason: 'Background task detected, routing to lite model',
      isBackground: true,
      requiresVision: false,
      requiresThinking: false,
    };
  }

  // Resolve model through three-layer system
  const { model, layer } = resolveModelName(
    req.model || 'gpt-4o',
    modelMappings.openai,
    DEFAULT_OPENAI_MAPPING
  );

  let finalModel = model;
  let reason = `Mapped from ${req.model || 'gpt-4o'} via ${layer}`;

  // Verify vision capability if needed
  if (needsVision && !VISION_MODELS.some(vm => finalModel.startsWith(vm))) {
    finalModel = 'gemini-2.5-flash';
    reason += ' (upgraded for vision)';
  }

  return {
    model: finalModel,
    reason,
    isBackground: false,
    requiresVision: needsVision,
    requiresThinking: false,
  };
}

/**
 * Get list of available models for OpenAI /v1/models endpoint
 */
export function getOpenAIModelList() {
  const models = new Set<string>();

  // Add OpenAI model names
  Object.keys(modelMappings.openai).forEach(m => models.add(m));
  Object.keys(DEFAULT_OPENAI_MAPPING).forEach(m => models.add(m));

  // Add Gemini models
  VISION_MODELS.forEach(m => models.add(m));

  // Add custom mappings
  Object.keys(modelMappings.custom).forEach(m => models.add(m));

  return Array.from(models).map(id => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: id.startsWith('gemini-') ? 'google' : id.startsWith('gpt-') ? 'openai' : 'proxy',
  }));
}

/**
 * Get list of available models for Claude /v1/models/claude endpoint
 */
export function getClaudeModelList() {
  const models = new Set<string>();

  // Add Claude model names
  Object.keys(modelMappings.anthropic).forEach(m => models.add(m));
  Object.keys(DEFAULT_CLAUDE_MAPPING).forEach(m => models.add(m));

  return Array.from(models).map(id => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'anthropic',
  }));
}
