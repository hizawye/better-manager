import { create } from 'zustand';
import { providersApi } from '../api/providers';
import type {
  ProvidersStatus,
  ProviderMetrics,
  ProviderLog,
  AnthropicConfig,
} from '../api/types';

interface ProviderStore {
  status: ProvidersStatus | null;
  metrics: ProviderMetrics[];
  logs: ProviderLog[];
  loading: boolean;
  error: string | null;
  testResult: { success: boolean; message: string } | null;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchMetrics: () => Promise<void>;
  fetchLogs: (limit?: number) => Promise<void>;
  resetMetrics: () => Promise<void>;
  updateAnthropicConfig: (config: AnthropicConfig) => Promise<void>;
  testAnthropicConnection: () => Promise<void>;
  toggleAnthropic: (enabled: boolean) => Promise<void>;
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  status: null,
  metrics: [],
  logs: [],
  loading: false,
  error: null,
  testResult: null,

  fetchStatus: async () => {
    set({ loading: true, error: null });
    try {
      const status = await providersApi.getStatus();
      set({ status, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch provider status',
        loading: false,
      });
    }
  },

  fetchMetrics: async () => {
    set({ loading: true, error: null });
    try {
      const { metrics } = await providersApi.getMetrics();
      set({ metrics, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch metrics',
        loading: false,
      });
    }
  },

  fetchLogs: async (limit = 100) => {
    set({ loading: true, error: null });
    try {
      const { logs } = await providersApi.getLogs(limit);
      set({ logs, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
        loading: false,
      });
    }
  },

  resetMetrics: async () => {
    try {
      await providersApi.resetMetrics();
      await get().fetchMetrics();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to reset metrics',
      });
      throw error;
    }
  },

  updateAnthropicConfig: async (config: AnthropicConfig) => {
    set({ loading: true, error: null });
    try {
      await providersApi.updateAnthropicConfig(config);
      await get().fetchStatus();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update Anthropic config',
        loading: false,
      });
      throw error;
    }
  },

  testAnthropicConnection: async () => {
    set({ loading: true, error: null, testResult: null });
    try {
      const result = await providersApi.testAnthropicConnection();
      set({ testResult: result, loading: false });
    } catch (error) {
      set({
        testResult: { success: false, message: error instanceof Error ? error.message : 'Connection test failed' },
        loading: false,
      });
    }
  },

  toggleAnthropic: async (enabled: boolean) => {
    set({ loading: true, error: null });
    try {
      await providersApi.toggleAnthropic(enabled);
      await get().fetchStatus();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle provider',
        loading: false,
      });
      throw error;
    }
  },
}));
