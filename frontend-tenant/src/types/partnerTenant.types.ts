/**
 * Tenants del alcance de un partner (`/api/partner/tenants`, ADR-041): el
 * tenant base y sus clientes (tenants hijos, `parent_tenant_id`).
 */

import type { TenantUser } from './tenantUser.types';

export type PartnerTenantStatus = 'active' | 'suspended' | 'trial';

export interface PartnerTenant {
  tenant_id: string;
  name: string;
  domain?: string | null;
  /** Nombre interno de la URL del apex (`intellify.pro/<slug>`). */
  slug?: string | null;
  status: PartnerTenantStatus;
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
  plan_id: string;
  parent_tenant_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerTenantBranding {
  logo_url?: string;
  primary_color?: string;
  tagline?: string;
  template_id?: string;
  [key: string]: unknown;
}

export interface PartnerAdminUserCreate {
  username: string;
  password: string;
  email?: string;
  nombre?: string;
  apellido?: string;
}

export interface PartnerTenantCreate {
  name: string;
  domain?: string;
  slug?: string;
  branding?: PartnerTenantBranding;
  /** Admin inicial del cliente: se crea en la misma transacción del alta. */
  admin_user?: PartnerAdminUserCreate;
}

export interface PartnerTenantUpdate {
  name?: string;
  domain?: string;
  slug?: string;
  status?: PartnerTenantStatus;
  branding?: PartnerTenantBranding;
}

export interface PartnerTenantsResponse {
  success: boolean;
  tenants: PartnerTenant[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface PartnerTenantCreateResponse {
  success: boolean;
  tenant: PartnerTenant;
}

export interface PartnerTenantBot {
  bot_id: string;
  name: string;
  description?: string | null;
  status: string;
  business_type?: string | null;
}

export interface PartnerTenantBotModule {
  bot_id: string;
  module_key: string;
  granted: boolean;
  enabled: boolean;
  available: boolean;
  module_name?: string | null;
  module_description?: string | null;
}

export interface PartnerTenantBotsResponse {
  success: boolean;
  bots: PartnerTenantBot[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export type PartnerTenantUser = TenantUser;
