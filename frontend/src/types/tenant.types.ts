/**
 * Tenant types - administración general (tenants, usuarios, módulos)
 */

export type TenantStatus = 'active' | 'suspended' | 'trial';
export type TenantUserRole = 'admin' | 'operativo';

export interface TenantBranding {
  logo_url?: string;
  primary_color?: string;
  tagline?: string;
}

export interface Tenant {
  tenant_id: string;
  name: string;
  domain?: string | null;
  status: TenantStatus;
  branding: TenantBranding;
  created_at: string;
  updated_at: string;
}

export interface TenantCreate {
  name: string;
  domain?: string;
  status?: TenantStatus;
  branding?: TenantBranding;
}

export interface TenantUpdate {
  name?: string;
  domain?: string;
  status?: TenantStatus;
  branding?: TenantBranding;
}

export interface TenantsResponse {
  success: boolean;
  tenants: Tenant[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface TenantUser {
  username: string;
  email?: string;
  tenant_id?: string | null;
  role: string;
  disabled: boolean;
}

export interface TenantUserCreate {
  username: string;
  password: string;
  email?: string;
  tenant_id: string;
  role: TenantUserRole;
}

export interface TenantUserUpdate {
  role?: TenantUserRole;
  disabled?: boolean;
  email?: string;
}

export interface TenantUsersResponse {
  success: boolean;
  users: TenantUser[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ModuleInfo {
  module_key: string;
  name: string;
  description?: string;
}

export interface BotModuleInfo {
  bot_id: string;
  module_key: string;
  granted: boolean;
  enabled: boolean;
  module_name?: string;
  module_description?: string;
}
