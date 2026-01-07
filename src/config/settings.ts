import 'dotenv/config';
import { SchedulingMode } from '../proxy/types.js';

export const config = {
  port: parseInt(process.env.PORT || '8094', 10),
  host: process.env.HOST || '127.0.0.1',
  dbPath: process.env.DB_PATH || 'data.db',
  logLevel: process.env.LOG_LEVEL || 'info',
  openBrowser: process.env.OPEN_BROWSER === 'true',
};

// Proxy server configuration
export interface ProxySettings {
  requireAuth: boolean;
  apiKey: string;
  schedulingMode: SchedulingMode;
  maxWaitSeconds: number;
  requestTimeout: number; // in seconds
  allowLanAccess: boolean;
}

export const proxySettings: ProxySettings = {
  requireAuth: process.env.PROXY_REQUIRE_AUTH === 'true',
  apiKey: process.env.PROXY_API_KEY || '',
  schedulingMode: (process.env.PROXY_SCHEDULING_MODE as SchedulingMode) || SchedulingMode.CacheFirst,
  maxWaitSeconds: parseInt(process.env.PROXY_MAX_WAIT_SECONDS || '60', 10),
  requestTimeout: parseInt(process.env.PROXY_REQUEST_TIMEOUT || '300', 10),
  allowLanAccess: process.env.PROXY_ALLOW_LAN === 'true',
};

// Model mappings (can be overridden via database or hot-reload)
export const modelMappings = {
  // Claude model mappings
  anthropic: {
    'claude-3-opus-20240229': 'gemini-3-pro-high',
    'claude-3-sonnet-20240229': 'gemini-3-pro-low',
    'claude-3-haiku-20240307': 'gemini-3-pro-low',
    'claude-3-5-sonnet-20240620': 'claude-sonnet-4-5',
    'claude-3-5-sonnet-20241022': 'claude-sonnet-4-5',
    'claude-3-5-haiku-20241022': 'gemini-3-pro-low',
    'claude-sonnet-4-20250514': 'claude-sonnet-4-5',
    'claude-opus-4-20250514': 'claude-opus-4-5-thinking',
    'claude-opus-4-5-20251101': 'claude-opus-4-5-thinking',
  } as Record<string, string>,

  // OpenAI model mappings
  openai: {
    'gpt-4': 'gemini-3-pro-high',
    'gpt-4-turbo': 'gemini-3-pro-high',
    'gpt-4o': 'gemini-3-pro-low',
    'gpt-4o-mini': 'gemini-3-pro-low',
    'gpt-3.5-turbo': 'gemini-3-pro-low',
  } as Record<string, string>,

  // Custom user-defined mappings
  custom: {} as Record<string, string>,
};

// Background task detection model
export const backgroundTaskModel = 'gemini-3-pro-low';

// Default fallback model
export const defaultModel = 'gemini-3-pro-low';

// Provider configuration
export type DispatchMode = 'off' | 'always' | 'fallback';

export interface ProviderConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  dispatchMode: DispatchMode;
  modelMapping: Record<string, string>;
}

export interface ProvidersConfig {
  anthropic: ProviderConfig;
}

// Runtime provider config (can be updated via API)
export const providers: ProvidersConfig = {
  anthropic: {
    enabled: process.env.ANTHROPIC_PROVIDER_ENABLED === 'true',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    dispatchMode: (process.env.ANTHROPIC_DISPATCH_MODE as DispatchMode) || 'off',
    modelMapping: {},
  },
};

/**
 * Update provider configuration at runtime
 */
export function updateProviderConfig(
  provider: keyof ProvidersConfig,
  config: Partial<ProviderConfig>
): void {
  Object.assign(providers[provider], config);
}

/**
 * Check if a model should use Anthropic provider
 */
export function shouldUseAnthropicProvider(model: string): boolean {
  const config = providers.anthropic;

  if (!config.enabled || config.dispatchMode === 'off') {
    return false;
  }

  // Check if model is explicitly mapped to Anthropic
  if (config.modelMapping[model]) {
    return true;
  }

  // In 'always' mode, all Claude models go to Anthropic
  if (config.dispatchMode === 'always' && model.startsWith('claude-')) {
    return true;
  }

  return false;
}
