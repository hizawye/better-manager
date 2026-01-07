import { api } from './client';
import type {
  ProvidersStatus,
  ProviderMetrics,
  ProviderLog,
  AnthropicConfig,
  ProviderStatus,
} from './types';

interface CostSummary {
  totalCost: number;
  byProvider: Record<string, number>;
}

export const providersApi = {
  // Get provider status/configuration
  getStatus: () => api.get<ProvidersStatus>('/providers'),

  // Get Anthropic provider config
  getAnthropicConfig: () => api.get<ProviderStatus>('/providers/anthropic'),

  // Update Anthropic provider config
  updateAnthropicConfig: (config: AnthropicConfig) =>
    api.put<{ success: boolean; config: ProviderStatus }>('/providers/anthropic', config),

  // Test Anthropic connection
  testAnthropicConnection: () =>
    api.post<{ success: boolean; message: string }>('/providers/anthropic/test'),

  // Toggle Anthropic provider
  toggleAnthropic: (enabled: boolean) =>
    api.post<{ success: boolean; enabled: boolean }>('/providers/anthropic/toggle', { enabled }),

  // Get all provider metrics
  getMetrics: () => api.get<{ metrics: ProviderMetrics[] }>('/providers/metrics'),

  // Get metrics for specific provider
  getProviderMetrics: (name: string) =>
    api.get<ProviderMetrics>(`/providers/metrics/${name}`),

  // Get logs for all providers
  getLogs: (limit = 100) =>
    api.get<{ logs: ProviderLog[]; count: number }>(
      `/providers/logs?limit=${limit}`
    ),

  // Get logs for specific provider
  getProviderLogs: (name: string, limit = 100) =>
    api.get<{ logs: ProviderLog[]; count: number }>(
      `/providers/logs/${name}?limit=${limit}`
    ),

  // Get cost summary
  getCosts: () => api.get<CostSummary>('/providers/costs'),

  // Get health status
  getHealth: () =>
    api.get<{ status: string; providers: Record<string, string> }>(
      '/providers/health'
    ),

  // Reset metrics
  resetMetrics: () => api.post('/providers/metrics/reset'),
};
