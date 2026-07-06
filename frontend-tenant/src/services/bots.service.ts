/**
 * Bots Service (frontend-tenant) - resumen read-only de los bots del propio
 * tenant, vía /api/tenant/bots. La creación/configuración técnica de bots es
 * responsabilidad exclusiva de administración general (otro app).
 */

import api from './api';
import type { TenantBotsResponse, BotStatus } from '../types/bot.types';

const botsService = {
  async getBots(filters: { page?: number; limit?: number; status?: BotStatus } = {}): Promise<TenantBotsResponse> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.status) params.append('status', filters.status);

    const response = await api.get<TenantBotsResponse>(`/tenant/bots?${params.toString()}`);
    return response.data;
  },
};

export default botsService;
