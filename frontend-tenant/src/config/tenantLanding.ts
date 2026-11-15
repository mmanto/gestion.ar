import { tenantIdentityKey } from './tenantIdentity';

/** Landings propias de un tenant, servidas por el SPA en su dominio. */
export type TenantLandingId = 'urbanvoice';

/**
 * Landing propia del tenant según su slug/nombre. `null` = la landing genérica
 * de `pages/Landing.tsx`. No depende de `branding.template_id`: el tema es del
 * backoffice y puede cambiar sin tocar el sitio público.
 */
export function tenantLandingFor(slug?: string | null, name?: string | null): TenantLandingId | null {
  return tenantIdentityKey(slug, name) === 'urbanvoice' ? 'urbanvoice' : null;
}
