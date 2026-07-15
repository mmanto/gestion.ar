/**
 * Tenant Users Service - gestión de usuarios del propio tenant
 */

import api from './api';
import type {
  TenantUser,
  TenantUserCreate,
  TenantUserUpdate,
  TenantUsersResponse,
} from '../types/tenantUser.types';

const tenantUsersService = {
  async listUsers(page = 1, limit = 50): Promise<TenantUsersResponse> {
    const response = await api.get<TenantUsersResponse>(
      `/tenant/users?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  async createUser(data: TenantUserCreate): Promise<TenantUser> {
    const response = await api.post<{ success: boolean; user: TenantUser }>(
      '/tenant/users',
      data
    );
    return response.data.user;
  },

  async updateUser(username: string, data: TenantUserUpdate): Promise<TenantUser> {
    const response = await api.patch<{ success: boolean; user: TenantUser }>(
      `/tenant/users/${username}`,
      data
    );
    return response.data.user;
  },
};

export default tenantUsersService;
