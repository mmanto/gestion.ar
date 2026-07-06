/**
 * Tenant Admin Service - HTTP service para administración general
 * (tenants, usuarios, módulos) — /api/admin/*
 */

import api from './api';
import type {
  BotModuleInfo,
  ModuleInfo,
  Tenant,
  TenantCreate,
  TenantsResponse,
  TenantUpdate,
  TenantUser,
  TenantUserCreate,
  TenantUsersResponse,
  TenantUserUpdate,
} from '../types/tenant.types';

const tenantAdminService = {
  async listTenants(page = 1, limit = 50): Promise<TenantsResponse> {
    const response = await api.get<TenantsResponse>(`/admin/tenants?page=${page}&limit=${limit}`);
    return response.data;
  },

  async getTenant(tenantId: string): Promise<Tenant> {
    const response = await api.get<{ success: boolean; tenant: Tenant }>(`/admin/tenants/${tenantId}`);
    return response.data.tenant;
  },

  async createTenant(data: TenantCreate): Promise<Tenant> {
    const response = await api.post<{ success: boolean; tenant: Tenant }>('/admin/tenants', data);
    return response.data.tenant;
  },

  async updateTenant(tenantId: string, data: TenantUpdate): Promise<Tenant> {
    const response = await api.patch<{ success: boolean; tenant: Tenant }>(`/admin/tenants/${tenantId}`, data);
    return response.data.tenant;
  },

  async listUsers(tenantId?: string, page = 1, limit = 50): Promise<TenantUsersResponse> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (tenantId) params.append('tenant_id', tenantId);
    const response = await api.get<TenantUsersResponse>(`/admin/users?${params.toString()}`);
    return response.data;
  },

  async createUser(data: TenantUserCreate): Promise<TenantUser> {
    const response = await api.post<{ success: boolean; user: TenantUser }>('/admin/users', data);
    return response.data.user;
  },

  async updateUser(username: string, data: TenantUserUpdate): Promise<TenantUser> {
    const response = await api.patch<{ success: boolean; user: TenantUser }>(`/admin/users/${username}`, data);
    return response.data.user;
  },

  async deleteUser(username: string): Promise<void> {
    await api.delete(`/admin/users/${username}`);
  },

  async listModules(): Promise<ModuleInfo[]> {
    const response = await api.get<{ success: boolean; modules: ModuleInfo[] }>('/admin/modules');
    return response.data.modules;
  },

  async getBotModules(botId: string): Promise<BotModuleInfo[]> {
    const response = await api.get<{ success: boolean; modules: BotModuleInfo[] }>(`/admin/bots/${botId}/modules`);
    return response.data.modules;
  },

  async grantModule(botId: string, moduleKey: string): Promise<BotModuleInfo> {
    const response = await api.post<{ success: boolean; module: BotModuleInfo }>(
      `/admin/bots/${botId}/modules/${moduleKey}/grant`
    );
    return response.data.module;
  },

  async revokeModule(botId: string, moduleKey: string): Promise<void> {
    await api.delete(`/admin/bots/${botId}/modules/${moduleKey}/grant`);
  },
};

export default tenantAdminService;
