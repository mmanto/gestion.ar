/**
 * Tenant types - administración general (tenants, usuarios, módulos)
 */

import type { BotStatus } from './bot.types';

export type TenantStatus = 'active' | 'suspended' | 'trial';
/** Roles de un usuario de tenant — espejo de `UserRole` en el backend
 * (`app/models/tenant.py`), sin `super_admin` (no se puede crear con tenant). */
export type TenantUserRole = 'admin' | 'operativo' | 'broker' | 'partner';
export type PlanPeriodicity = 'monthly' | 'annual';
// Estado de la solicitud de plan del tenant: 'pending' al darse de alta por
// autoregistro/gmail; el pase a approved/active lo hace super_admin (ADR-013).
export type SubscriptionStatus = 'pending' | 'approved' | 'active';

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
  /** Tenant base del que se derivó (NULL/ausente = tenant raíz). Ver ADR-041. */
  parent_tenant_id?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Alta de un tenant derivado por un partner: plan, estado, settings y marca
 * salen del tenant base, así que sólo se eligen nombre y dominio.
 */
export interface PartnerTenantCreate {
  name: string;
  domain?: string;
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
  // Plan que el usuario eligió al darse de alta (autoregistro/gmail) y su
  // estado de aprobación: pending → approved/active (manual, super_admin,
  // ver ADR-013).
  requested_plan_id?: string | null;
  subscription_status?: SubscriptionStatus;
}

/**
 * Roles que administra el panel general (`/api/admin/users`). Es el espejo
 * completo de `UserRole` del backend: a diferencia de `TenantUserRole` incluye
 * `super_admin`, el único rol sin tenant.
 */
export type AdminUserRole = 'super_admin' | 'admin' | 'operativo' | 'broker' | 'partner';

export interface TenantUserCreate {
  username: string;
  password: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  /** Obligatorio salvo `role: 'super_admin'` (ver ADR-041). */
  tenant_id?: string;
  role: AdminUserRole;
}

export interface TenantUserUpdate {
  role?: AdminUserRole;
  disabled?: boolean;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  /** Nueva contraseña; omitirla conserva la actual. */
  password?: string;
}

export interface TenantUsersResponse {
  success: boolean;
  users: TenantUser[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

/**
 * Resumen read-only de un agente de un tenant (lo único que ve el partner: no
 * edita su configuración técnica, ver ADR-041).
 */
export interface TenantBotSummary {
  bot_id: string;
  name: string;
  description?: string | null;
  status: BotStatus;
  business_type: string;
}

export interface TenantBotsResponse {
  success: boolean;
  bots: TenantBotSummary[];
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

/**
 * Módulo del catálogo con su estado **para el tenant** (no para un bot): es el
 * entitlement que permite usar un módulo sin agente. La existencia de la fila
 * = otorgado; `enabled` es lo que el tenant puede apagar. Ver ADR-029.
 */
export interface TenantModuleInfo {
  tenant_id: string;
  module_key: string;
  granted: boolean;
  enabled: boolean;
  available: boolean;
  module_name?: string;
  module_description?: string;
}
