// Model mappings API client

import { api } from './client';

export interface MappingsResponse {
  builtIn: {
    anthropic: Record<string, string>;
    openai: Record<string, string>;
  };
  custom: Record<string, string>;
  availableTargets: string[];
}

export interface MappingUpdateResponse {
  success: boolean;
  mappings: Record<string, string>;
}

export const mappingsApi = {
  getAll: () => api.get<MappingsResponse>('/mappings'),

  add: (from: string, to: string) =>
    api.post<MappingUpdateResponse>('/mappings', { from, to }),

  remove: (from: string) =>
    api.delete<MappingUpdateResponse>(`/mappings/${encodeURIComponent(from)}`),
};
