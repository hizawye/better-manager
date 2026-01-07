import { create } from 'zustand';
import { configApi } from '../api/config';
import type { ProxyConfig } from '../api/types';

interface ConfigStore {
  proxyConfig: ProxyConfig | null;
  loading: boolean;
  error: string | null;
  theme: string;
  language: string;

  // Actions
  fetchProxyConfig: () => Promise<void>;
  updateProxyConfig: (config: Partial<ProxyConfig>) => Promise<void>;
  setTheme: (theme: string) => void;
  setLanguage: (language: string) => void;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  proxyConfig: null,
  loading: false,
  error: null,
  theme: localStorage.getItem('theme') || 'dark',
  language: localStorage.getItem('language') || 'en',

  fetchProxyConfig: async () => {
    set({ loading: true, error: null });
    try {
      const proxyConfig = await configApi.getProxyConfig();
      set({ proxyConfig, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch config',
        loading: false,
      });
    }
  },

  updateProxyConfig: async (config: Partial<ProxyConfig>) => {
    try {
      const updated = await configApi.updateProxyConfig(config);
      set({ proxyConfig: updated });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update config',
      });
      throw error;
    }
  },

  setTheme: (theme: string) => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  setLanguage: (language: string) => {
    localStorage.setItem('language', language);
    set({ language });
  },
}));
