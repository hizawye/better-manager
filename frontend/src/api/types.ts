// API Type Definitions
// Mirror backend types from database schema

export interface Account {
  id: number;
  email: string;
  subscription_tier: string;
  quota_info?: QuotaInfo;
  is_forbidden: boolean;
  disabled_for_proxy: boolean;
  created_at?: string;
}

export interface QuotaInfo {
  pro_quota: number;
  flash_quota: number;
  image_quota: number;
}

export interface ProxyConfig {
  host: string;
  port: number;
  schedulingMode: string;
  sessionStickiness: boolean;
  allowedModels: string[];
  apiKey?: string;
}

export interface MonitorLog {
  id: number;
  timestamp: string;
  account_email: string;
  model: string;
  status_code: number;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  error_message?: string;
}

export interface MonitorStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgLatency: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface ProviderStatus {
  enabled: boolean;
  dispatchMode: 'off' | 'always' | 'fallback';
  hasApiKey: boolean;
  baseUrl?: string;
  modelMapping: Record<string, string>;
}

export interface ProvidersStatus {
  providers: {
    anthropic: ProviderStatus;
  };
}

export interface AnthropicConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  dispatchMode?: 'off' | 'always' | 'fallback';
  modelMapping?: Record<string, string>;
}

export interface ProviderMetrics {
  provider: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  avgLatencyMs: number;
  errorRate: number;
}

export interface ProviderLog {
  id: string;
  provider: string;
  timestamp: string;
  model: string;
  statusCode: number;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  error?: string;
}

// API Response wrappers
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
