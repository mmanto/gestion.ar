/**
 * Tenant types - administración general (tenants, usuarios, módulos)
 */

export type TenantStatus = 'active' | 'suspended' | 'trial';
export type TenantUserRole = 'admin' | 'operativo';
export type PlanPeriodicity = 'monthly' | 'annual';

export interface TenantBranding {
  logo_url?: string;
  logo_url_horizontal?: string;
  logo_url_vertical?: string;
  primary_color?: string;
  tagline?: string;
}

export interface Plan {
  plan_id: string;
  name: string;
  description?: string | null;
  amount: number;
  periodicity: PlanPeriodicity;
  created_at: string;
  updated_at: string;
}

export interface PlanCreate {
  name: string;
  description?: string;
  amount: number;
  periodicity: PlanPeriodicity;
}

export interface PlanUpdate {
  name?: string;
  description?: string;
  amount?: number;
  periodicity?: PlanPeriodicity;
}

export interface Tenant {
  tenant_id: string;
  name: string;
  domain?: string | null;
  status: TenantStatus;
  branding: TenantBranding;
  plan_id: string;
  created_at: string;
  updated_at: string;
}

export interface TenantCreate {
  name: string;
  domain?: string;
  status?: TenantStatus;
  branding?: TenantBranding;
  plan_id: string;
}

export interface TenantUpdate {
  name?: string;
  domain?: string;
  status?: TenantStatus;
  branding?: TenantBranding;
  plan_id?: string;
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
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  tenant_id?: string | null;
  role: string;
  disabled: boolean;
}

export interface TenantUserCreate {
  username: string;
  password: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  tenant_id: string;
  role: TenantUserRole;
}

export interface TenantUserUpdate {
  role?: TenantUserRole;
  disabled?: boolean;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
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
  // Distinto de `granted`: true si el módulo puede usarse (otorgado O
  // incluido en el plan del tenant, ver ADR-008). Es el campo correcto
  // para decidir si una página puede llamar a la API del módulo sin
  // recibir 403 — `granted` es solo para la UI de otorgamiento manual.
  available: boolean;
  module_name?: string;
  module_description?: string;
}
