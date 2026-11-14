import type { TemplateId } from '../types/template.types';

/**
 * Tema por defecto para tenants que todavía no eligieron uno en Ajustes › Marca.
 *
 * UrbanVoice se identifica por su slug (o, si el tenant viejo no tiene slug, por
 * su nombre): `urbanvoice`, `urban-voice` y «Urban Voice» normalizan al mismo
 * valor. El valor guardado en `branding.template_id` siempre gana, así que el
 * tenant puede cambiar de tema desde Ajustes.
 */
export function defaultTemplateForTenant(slug?: string | null, name?: string | null): TemplateId {
  const key = String(slug || name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return key === 'urbanvoice' ? 'urbanvoice' : 'default';
}
