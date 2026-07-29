/**
 * Tenant Users Service - lista de usuarios del propio tenant (admin/operativo/broker),
 * usada para asignar el dueño de un canal/link (ver Channel.owner_username).
 */
import api from './api';
import type { TenantUsersResponse } from '../types/tenant.types';

export async function listTenantUsers(page = 1, limit = 200): Promise<TenantUsersResponse> {
  const response = await api.get<TenantUsersResponse>(`/tenant/users?page=${page}&limit=${limit}`);
  return response.data;
}
