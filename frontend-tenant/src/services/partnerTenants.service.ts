/**
 * Partner tenants service — clientes del tenant base (`/api/partner/*`,
 * ADR-041). Lo usa el tema UrbanVoice: sus «clientes» son tenants hijos del
 * tenant servido (ver ADR-046).
 */

import api from './api';
import type {
  PartnerTenant,
  PartnerTenantBot,
  PartnerTenantBotModule,
  PartnerTenantBotsResponse,
  PartnerTenantCreate,
  PartnerTenantCreateResponse,
  PartnerTenantsResponse,
  PartnerTenantUpdate,
} from '../types/partnerTenant.types';
import type { TenantUser, TenantUserCreate, TenantUserUpdate, TenantUsersResponse } from '../types/tenantUser.types';

const partnerTenantsService = {
  async listTenants(page = 1, limit = 100): Promise<PartnerTenantsResponse> {
    const response = await api.get<PartnerTenantsResponse>(
      `/partner/tenants?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  async getTenant(tenantId: string): Promise<PartnerTenant> {
    const response = await api.get<{ success: boolean; tenant: PartnerTenant }>(
      `/partner/tenants/${encodeURIComponent(tenantId)}`,
    );
    return response.data.tenant;
  },

  /** Alta de un cliente: clona agente/módulos del tenant base y, si viene
   * `admin_user`, crea su admin en la misma transacción. */
  async createTenant(data: PartnerTenantCreate): Promise<PartnerTenant> {
    const response = await api.post<PartnerTenantCreateResponse>('/partner/tenants', data);
    return response.data.tenant;
  },

  async updateTenant(tenantId: string, data: PartnerTenantUpdate): Promise<PartnerTenant> {
    const response = await api.patch<{ success: boolean; tenant: PartnerTenant }>(
      `/partner/tenants/${encodeURIComponent(tenantId)}`,
      data,
    );
    return response.data.tenant;
  },

  async deleteTenant(tenantId: string): Promise<void> {
    await api.delete(`/partner/tenants/${encodeURIComponent(tenantId)}`);
  },

  async listBots(tenantId: string): Promise<PartnerTenantBot[]> {
    const response = await api.get<PartnerTenantBotsResponse>(
      `/partner/tenants/${encodeURIComponent(tenantId)}/bots?limit=100`,
    );
    return response.data.bots;
  },

  /** Copia los agentes actuales del tenant base a un cliente sin agentes
   * (reparación: el alta clona una foto del base). */
  async cloneAgents(tenantId: string): Promise<number> {
    const response = await api.post<{ success: boolean; cloned: number }>(
      `/partner/tenants/${encodeURIComponent(tenantId)}/agents/clone`,
    );
    return response.data.cloned;
  },

  async listBotModules(tenantId: string, botId: string): Promise<PartnerTenantBotModule[]> {
    const response = await api.get<{ success: boolean; modules: PartnerTenantBotModule[] }>(
      `/partner/tenants/${encodeURIComponent(tenantId)}/bots/${encodeURIComponent(botId)}/modules`,
    );
    return response.data.modules;
  },

  /** Prende/apaga un módulo ya otorgado (el partner no otorga ni revoca). */
  async setBotModuleEnabled(
    tenantId: string,
    botId: string,
    moduleKey: string,
    enabled: boolean,
  ): Promise<PartnerTenantBotModule> {
    const response = await api.patch<{ success: boolean; module: PartnerTenantBotModule }>(
      `/partner/tenants/${encodeURIComponent(tenantId)}/bots/${encodeURIComponent(botId)}/modules/${encodeURIComponent(moduleKey)}`,
      { enabled },
    );
    return response.data.module;
  },

  async listUsers(tenantId: string, page = 1, limit = 100): Promise<TenantUsersResponse> {
    const response = await api.get<TenantUsersResponse>(
      `/partner/tenants/${encodeURIComponent(tenantId)}/users?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  async createUser(tenantId: string, data: TenantUserCreate): Promise<TenantUser> {
    const response = await api.post<{ success: boolean; user: TenantUser }>(
      `/partner/tenants/${encodeURIComponent(tenantId)}/users`,
      data,
    );
    return response.data.user;
  },

  async updateUser(tenantId: string, username: string, data: TenantUserUpdate): Promise<TenantUser> {
    const response = await api.patch<{ success: boolean; user: TenantUser }>(
      `/partner/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(username)}`,
      data,
    );
    return response.data.user;
  },

  async deleteUser(tenantId: string, username: string): Promise<void> {
    await api.delete(
      `/partner/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(username)}`,
    );
  },
};

export default partnerTenantsService;
