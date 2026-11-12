/**
 * Constantes de plataforma compartidas por el panel de administración general.
 */

/**
 * Origen del apex: sirve el SPA de tenant en modo path
 * (`https://intellify.pro/<slug>/…`), sin DNS, router Traefik ni certificado
 * por tenant. El sitio de marketing vive en `www.intellify.pro`.
 */
export const PLATFORM_TENANT_ORIGIN = 'https://intellify.pro';

/**
 * URL interna del tenant, o `null` si todavía no tiene nombre interno (tenants
 * creados por los scripts históricos de alta).
 */
export function tenantInternalUrl(slug?: string | null): string | null {
  const normalized = (slug ?? '').trim();
  return normalized ? `${PLATFORM_TENANT_ORIGIN}/${normalized}` : null;
}
