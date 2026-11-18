import { TEMPLATE_IDS } from '../types/template.types';
import type { TemplateId } from '../types/template.types';
import { tenantIdentityKey } from './tenantIdentity';

/**
 * Tema por defecto para tenants que todavía no eligieron uno en Ajustes › Marca.
 *
 * UrbanVoice se identifica por su slug (o, si el tenant viejo no tiene slug, por
 * su nombre): `urbanvoice`, `urban-voice` y «Urban Voice» normalizan al mismo
 * valor. El valor guardado en `branding.template_id` siempre gana, así que el
 * tenant puede cambiar de tema desde Ajustes.
 */
export function defaultTemplateForTenant(slug?: string | null, name?: string | null): TemplateId {
  return tenantIdentityKey(slug, name) === 'urbanvoice' ? 'urbanvoice' : 'default';
}

/** Fuente mínima para resolver el tema: el tenant público o nada (antes de
 * cargar). Un `branding.template_id` guardado siempre gana. */
export interface TenantTemplateSource {
  slug?: string | null;
  name?: string | null;
  branding?: { template_id?: string };
}

/** Tema efectivo del tenant (por ejemplo, el que decide el login). */
export function resolveTenantTemplateId(tenant: TenantTemplateSource | null | undefined): TemplateId {
  const stored = tenant?.branding?.template_id;
  if (stored && (TEMPLATE_IDS as readonly string[]).includes(stored)) {
    return stored as TemplateId;
  }
  return defaultTemplateForTenant(tenant?.slug, tenant?.name);
}
