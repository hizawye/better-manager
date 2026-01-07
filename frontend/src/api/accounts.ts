import { api } from './client';
import type { Account } from './types';

export const accountsApi = {
  // Get all accounts
  getAll: () => api.get<Account[]>('/accounts'),

  // Set current account
  setCurrent: (id: number) => api.post(`/accounts/${id}/current`),

  // Toggle account active/inactive
  toggle: (id: number) => api.put(`/accounts/${id}/toggle`),

  // Delete account
  delete: (id: number) => api.delete(`/accounts/${id}`),

  // Refresh all accounts
  refreshAll: () => api.post('/accounts/refresh'),

  // Refresh quota for specific account
  refreshQuota: (id: number) => api.post(`/accounts/${id}/refresh-quota`),
};
