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
