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
  /** Tema visual del backoffice ('default' | 'kero') — ver TemplateId en template.types.ts. */
  template_id?: string;
  /** Si la barra lateral de navegación se muestra en el backoffice. Default: true. */
  sidebar_visible?: boolean;
  /**
   * Rubro del tenant -- eje de personalización de CONTENIDO (labels del
   * menú, qué se muestra en el Escritorio), distinto de template_id (que es
   * solo tema visual/layout). Sin elegir, se comporta como 'legal'
   * (heredado del bot IUS original). Ver config/navLinks.tsx e
   * industry.ts.
   */
  industry?: TenantIndustry;
}

export type TenantIndustry = 'legal' | 'salud' | 'generico';

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
