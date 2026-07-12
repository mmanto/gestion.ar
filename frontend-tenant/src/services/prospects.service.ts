/**
 * Prospects Service - HTTP service for prospect management
 */

import api from './api';
import type { Prospect, ProspectsResponse, ProspectResponse } from '../types/prospect.types';

const prospectsService = {
  async getProspects(filters: { page?: number; limit?: number } = {}): Promise<ProspectsResponse> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const response = await api.get<ProspectsResponse>(`/prospects?${params.toString()}`);
    return response.data;
  },

  async getProspectById(prospectId: string): Promise<Prospect> {
    const response = await api.get<ProspectResponse>(`/prospects/${prospectId}`);
    return response.data.prospect;
  },
};

export default prospectsService;
