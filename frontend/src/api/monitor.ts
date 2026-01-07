import { api } from './client';
import type { MonitorLog, MonitorStats } from './types';

interface LogsResponse {
  logs: MonitorLog[];
  total: number;
  limit: number;
  offset: number;
}

interface BackendStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgLatency: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export const monitorApi = {
  // Get logs with pagination
  getLogs: async (limit = 100, offset = 0): Promise<MonitorLog[]> => {
    const response = await api.get<LogsResponse>(`/monitor/logs?limit=${limit}&offset=${offset}`);
    return response.logs || [];
  },

  // Get statistics (map backend field names to frontend)
  getStats: async (): Promise<MonitorStats> => {
    const response = await api.get<BackendStats>('/monitor/stats');
    return {
      totalRequests: response.totalRequests || 0,
      successCount: response.successCount || 0,
      errorCount: response.errorCount || 0,
      avgLatency: response.avgLatency || 0,
      totalTokensIn: response.totalInputTokens || 0,
      totalTokensOut: response.totalOutputTokens || 0,
    };
  },

  // Clear all logs
  clearLogs: () => api.delete('/monitor/logs'),
};
