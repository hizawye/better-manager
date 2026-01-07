import { create } from 'zustand';
import { monitorApi } from '../api/monitor';
import type { MonitorLog, MonitorStats } from '../api/types';

interface MonitorStore {
  logs: MonitorLog[];
  stats: MonitorStats | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchLogs: (limit?: number, offset?: number) => Promise<void>;
  fetchStats: () => Promise<void>;
  clearLogs: () => Promise<void>;
}

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  logs: [],
  stats: null,
  loading: false,
  error: null,

  fetchLogs: async (limit = 100, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const logs = await monitorApi.getLogs(limit, offset);
      set({ logs, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
        loading: false,
      });
    }
  },

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const stats = await monitorApi.getStats();
      set({ stats, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch stats',
        loading: false,
      });
    }
  },

  clearLogs: async () => {
    try {
      await monitorApi.clearLogs();
      set({ logs: [], stats: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to clear logs',
      });
      throw error;
    }
  },
}));
