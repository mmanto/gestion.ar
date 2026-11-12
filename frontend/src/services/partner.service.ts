/**
 * Partner Service - HTTP service del panel del rol `partner` (/api/partner/*).
 *
 * Alcance: su tenant base y los tenants derivados de él. A diferencia de
 * `tenantAdminService` (/api/admin/*), no hay planes, otorgamiento de módulos
 * ni configuración técnica de agentes: sólo alta/edición de tenants, toggle de
 * módulos ya otorgados y usuarios (ver ADR-041).
 */

import api from './api';
import type {
  BotModuleInfo,
  PartnerTenantCreate,
  Tenant,
  TenantsResponse,
  TenantUpdate,
  TenantUser,
  TenantUserCreate,
  TenantUsersResponse,
  TenantUserUpdate,
  TenantBotsResponse,
} from '../types/tenant.types';

/** Alta de usuario desde el panel del partner: el tenant va en la ruta. */
export type PartnerUserCreate = Omit<TenantUserCreate, 'tenant_id'>;

const partnerService = {
  async listTenants(page = 1, limit = 50): Promise<TenantsResponse> {
    const response = await api.get<TenantsResponse>(`/partner/tenants?page=${page}&limit=${limit}`);
    return response.data;
  },

  async getTenant(tenantId: string): Promise<Tenant> {
    const response = await api.get<{ success: boolean; tenant: Tenant }>(`/partner/tenants/${tenantId}`);
    return response.data.tenant;
  },

  async createTenant(data: PartnerTenantCreate): Promise<Tenant> {
    const response = await api.post<{ success: boolean; tenant: Tenant }>('/partner/tenants', data);
    return response.data.tenant;
  },

  async updateTenant(tenantId: string, data: TenantUpdate): Promise<Tenant> {
    const response = await api.patch<{ success: boolean; tenant: Tenant }>(
      `/partner/tenants/${tenantId}`,
      data,
    );
    return response.data.tenant;
  },

  async deleteTenant(tenantId: string): Promise<void> {
    await api.delete(`/partner/tenants/${tenantId}`);
  },

  async listBots(tenantId: string, page = 1, limit = 100): Promise<TenantBotsResponse> {
    const response = await api.get<TenantBotsResponse>(
      `/partner/tenants/${tenantId}/bots?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  async listUsers(tenantId: string, page = 1, limit = 50): Promise<TenantUsersResponse> {
    const response = await api.get<TenantUsersResponse>(
      `/partner/tenants/${tenantId}/users?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  async createUser(tenantId: string, data: PartnerUserCreate): Promise<TenantUser> {
    const response = await api.post<{ success: boolean; user: TenantUser }>(
      `/partner/tenants/${tenantId}/users`,
      data,
    );
    return response.data.user;
  },

  async updateUser(tenantId: string, username: string, data: TenantUserUpdate): Promise<TenantUser> {
    const response = await api.patch<{ success: boolean; user: TenantUser }>(
      `/partner/tenants/${tenantId}/users/${username}`,
      data,
    );
    return response.data.user;
  },

  async deleteUser(tenantId: string, username: string): Promise<void> {
    await api.delete(`/partner/tenants/${tenantId}/users/${username}`);
  },

  /** Módulos del agente con su estado de otorgamiento (sólo lectura del grant). */
  async getBotModules(tenantId: string, botId: string): Promise<BotModuleInfo[]> {
    const response = await api.get<{ success: boolean; modules: BotModuleInfo[] }>(
      `/partner/tenants/${tenantId}/bots/${botId}/modules`,
    );
    return response.data.modules;
  },

  /** Prende/apaga un módulo ya otorgado (403 si no lo está). */
  async setBotModuleEnabled(
    tenantId: string,
    botId: string,
    moduleKey: string,
    enabled: boolean,
  ): Promise<BotModuleInfo> {
    const response = await api.patch<{ success: boolean; module: BotModuleInfo }>(
      `/partner/tenants/${tenantId}/bots/${botId}/modules/${moduleKey}`,
      { enabled },
    );
    return response.data.module;
  },
};

export default partnerService;
