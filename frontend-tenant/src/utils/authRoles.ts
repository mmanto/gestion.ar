/**
 * Roles que atiende el panel del tenant (`frontend-tenant`).
 *
 * `super_admin` y `partner` viven en el panel de administración general
 * (`frontend/`, ADR-041): el backend les rechaza los endpoints
 * `require_role('admin')` y las rutas protegidas de este SPA los rebotan a
 * `/login`. Si la sesión igual se establece, `/login` ve `isAuthenticated` y
 * vuelve a mandar al home: loop infinito login → dashboard → login. Por eso el
 * rol se valida ANTES de guardar el token, igual que en
 * `frontend/src/context/AuthContext.tsx`.
 */
export const TENANT_PANEL_ROLES: readonly string[] = ['admin', 'operativo'];

export const ROLE_NOT_ALLOWED_MESSAGE =
  'Esta cuenta no tiene acceso a este panel. Ingresá desde el panel de administración general.';

/** Lanza si el rol no pertenece a este panel. */
export function assertTenantPanelRole(role: string): void {
  if (!TENANT_PANEL_ROLES.includes(role)) {
    throw new Error(ROLE_NOT_ALLOWED_MESSAGE);
  }
}
