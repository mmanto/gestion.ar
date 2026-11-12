/**
 * Tenant Scope Service - unifica la administración de tenants del panel
 * general entre `super_admin` (/api/admin/*) y `partner` (/api/partner/*).
 *
 * Las pantallas de tenants (listado y edición) son una sola: lo único que
 * cambia según el rol es contra qué endpoints hablan y qué campos manda cada
 * una. El adapter evita duplicar esas dos pantallas (ver ADR-041).
 */

import tenantAdminService from './tenantAdmin.service';
import partnerService from './partner.service';
import botsService from './bots.service';
import type { UserRole } from '../types/auth.types';
import type {
  PartnerTenantCreate,
  Tenant,
  TenantBotsResponse,
  TenantCreate,
  TenantsResponse,
  TenantUpdate,
  TenantUser,
  TenantUserCreate,
  TenantUsersResponse,
  TenantUserUpdate,
} from '../types/tenant.types';

/** Alta de usuario desde la pantalla de tenant (sin `tenant_id`: va en la ruta). */
export type ScopedUserCreate = Omit<TenantUserCreate, 'tenant_id'>;

export interface TenantScopeApi {
  listTenants(page: number, limit: number): Promise<TenantsResponse>;
  getTenant(tenantId: string): Promise<Tenant>;
  createTenant(data: TenantCreate | PartnerTenantCreate): Promise<Tenant>;
  updateTenant(tenantId: string, data: TenantUpdate): Promise<Tenant>;
  deleteTenant(tenantId: string): Promise<void>;
  listBots(tenantId: string): Promise<TenantBotsResponse>;
  listUsers(tenantId: string, page: number, limit: number): Promise<TenantUsersResponse>;
  createUser(tenantId: string, data: ScopedUserCreate): Promise<TenantUser>;
  updateUser(tenantId: string, username: string, data: TenantUserUpdate): Promise<TenantUser>;
  deleteUser(tenantId: string, username: string): Promise<void>;
}

/** Administración general: todo el catálogo (planes, marca, agentes, usuarios). */
const adminScope: TenantScopeApi = {
  listTenants: (page, limit) => tenantAdminService.listTenants(page, limit),
  getTenant: (tenantId) => tenantAdminService.getTenant(tenantId),
  createTenant: (data) => tenantAdminService.createTenant(data as TenantCreate),
  updateTenant: (tenantId, data) => tenantAdminService.updateTenant(tenantId, data),
  deleteTenant: (tenantId) => tenantAdminService.deleteTenant(tenantId),
  listBots: (tenantId) => botsService.getBots({ tenant_id: tenantId, limit: 100 }),
  listUsers: (tenantId, page, limit) => tenantAdminService.listUsers(tenantId, page, limit),
  createUser: (tenantId, data) => tenantAdminService.createUser({ ...data, tenant_id: tenantId }),
  updateUser: (_tenantId, username, data) => tenantAdminService.updateUser(username, data),
  deleteUser: (_tenantId, username) => tenantAdminService.deleteUser(username),
};

/**
 * Partner: sólo su tenant base y los derivados. El alta de tenant manda
 * únicamente nombre y dominio — plan, estado y settings los pone el backend
 * copiándolos del tenant base.
 */
const partnerScope: TenantScopeApi = {
  listTenants: (page, limit) => partnerService.listTenants(page, limit),
  getTenant: (tenantId) => partnerService.getTenant(tenantId),
  createTenant: (data) =>
    partnerService.createTenant({ name: data.name.trim(), domain: data.domain?.trim() || undefined }),
  updateTenant: (tenantId, data) => partnerService.updateTenant(tenantId, data),
  deleteTenant: (tenantId) => partnerService.deleteTenant(tenantId),
  listBots: (tenantId) => partnerService.listBots(tenantId, 1, 100),
  listUsers: (tenantId, page, limit) => partnerService.listUsers(tenantId, page, limit),
  createUser: (tenantId, data) => partnerService.createUser(tenantId, data),
  updateUser: (tenantId, username, data) => partnerService.updateUser(tenantId, username, data),
  deleteUser: (tenantId, username) => partnerService.deleteUser(tenantId, username),
};

export function tenantScopeApi(role: UserRole): TenantScopeApi {
  return role === 'partner' ? partnerScope : adminScope;
}
