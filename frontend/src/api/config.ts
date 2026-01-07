import { api } from './client';
import type { ProxyConfig } from './types';

export const configApi = {
  // Get proxy configuration
  getProxyConfig: () => api.get<ProxyConfig>('/config/proxy'),

  // Update proxy configuration
  updateProxyConfig: (config: Partial<ProxyConfig>) =>
    api.put<ProxyConfig>('/config/proxy', config),
};
