import type { TenantPublicInfo } from '../types/tenant.types';
import type { TenantTemplateSource } from '../config/tenantTemplateDefaults';
import { resolveTenantTemplateId } from '../config/tenantTemplateDefaults';

/**
 * Roles que atiende el panel del tenant (`frontend-tenant`).
 *
 * `super_admin` vive en el panel de administración general (`frontend/`,
 * ADR-041): el backend le rechaza los endpoints `require_role('admin')` y las
 * rutas protegidas de este SPA lo rebotan a `/login`. Si la sesión igual se
 * establece, `/login` ve `isAuthenticated` y vuelve a mandar al home: loop
 * infinito login → dashboard → login. Por eso el rol se valida ANTES de
 * guardar el token, igual que en `frontend/src/context/AuthContext.tsx`.
 */
export const TENANT_PANEL_ROLES: readonly string[] = ['admin', 'operativo'];

/**
 * El rol `partner` administra un tenant base y sus clientes (tenants hijos,
 * ADR-041); su superficie es `/api/partner/*`. Cuando el tenant servido es
 * UrbanVoice, este SPA es su panel: el tema UrbanVoice reemplaza la pantalla
 * de tenants del panel general (ver ADR-046). En cualquier otro tenant sigue
 * rechazado.
 */
export function isPartnerPanel(tenant: TenantPublicInfo | TenantTemplateSource | null | undefined): boolean {
  return resolveTenantTemplateId(tenant) === 'urbanvoice';
}

export function canUseTenantPanel(
  role: string,
  tenant: TenantPublicInfo | TenantTemplateSource | null | undefined,
): boolean {
  if (TENANT_PANEL_ROLES.includes(role)) return true;
  return role === 'partner' && isPartnerPanel(tenant);
}

export const ROLE_NOT_ALLOWED_MESSAGE =
  'Esta cuenta no tiene acceso a este panel. Ingresá desde el panel de administración general.';

/** Lanza si el rol no pertenece a este panel (ver `canUseTenantPanel`). */
export function assertTenantPanelRole(
  role: string,
  tenant: TenantPublicInfo | TenantTemplateSource | null | undefined,
): void {
  if (!canUseTenantPanel(role, tenant)) {
    throw new Error(ROLE_NOT_ALLOWED_MESSAGE);
  }
}
