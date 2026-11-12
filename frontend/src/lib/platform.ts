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

/** Dominio propio del tenant como URL absoluta (`ius.legal` → `https://ius.legal`). */
function domainUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

/**
 * URL del sitio del tenant para abrirlo desde el panel.
 *
 * Prioriza el dominio externo (`tenants.domain`); si no tiene, usa la URL
 * interna del apex (`intellify.pro/<slug>`). Un tenant sin ninguno de los dos
 * (los creados por los scripts históricos no tienen `slug`) devuelve `null`.
 */
export function tenantSiteUrl(tenant: { domain?: string | null; slug?: string | null }): string | null {
  const domain = (tenant.domain ?? "").trim();
  if (domain) return domainUrl(domain);
  return tenantInternalUrl(tenant.slug);
}
