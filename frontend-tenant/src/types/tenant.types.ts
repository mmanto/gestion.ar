/**
 * Tenant types (frontend-tenant) - info pública del propio tenant, usada
 * para pintar landing/login con su marca, y los tipos de módulos/training
 * que el admin del tenant puede gestionar.
 */

export interface TenantBranding {
  logo_url?: string;
  logo_url_horizontal?: string;
  logo_url_vertical?: string;
  primary_color?: string;
  tagline?: string;
}

export type TenantStatus = 'active' | 'suspended' | 'trial';

export interface TenantPublicInfo {
  tenant_id: string;
  name: string;
  status: TenantStatus;
  branding: TenantBranding;
}

export interface BotModuleInfo {
  bot_id: string;
  module_key: string;
  granted: boolean;
  enabled: boolean;
  module_name?: string;
  module_description?: string;
}
