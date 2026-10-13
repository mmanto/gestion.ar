import { Capacitor } from '@capacitor/core';
import type { NavigateFunction } from 'react-router-dom';
import type { User } from '../types/auth.types';
import type { TenantPublicInfo } from '../types/tenant.types';

/**
 * A qué pantalla mandar al usuario después de iniciar sesión.
 *
 * El tenant puede configurar una por rol en `settings.home_paths` — p. ej.
 * `{"operativo": "/reclamos"}` en pachoteayuda, donde los operarios trabajan
 * sobre la landing de reclamos. Sin configuración, el panel (`/dashboard`).
 *
 * En la app nativa siempre es `/dashboard`: las pantallas configuradas las
 * sirve la landing por dominio, no el bundle del WebView.
 */
export function resolveHomePath(user: User | null, tenant: TenantPublicInfo | null): string {
  if (!user || Capacitor.isNativePlatform()) return '/dashboard';
  return tenant?.settings?.home_paths?.[user.role] || '/dashboard';
}

/**
 * Navega a esa pantalla. Las configuradas (p. ej. `/reclamos`) viven fuera del
 * SPA — las sirve la landing — así que requieren navegación completa; para
 * `/dashboard` se mantiene la navegación client-side y no se recarga el bundle.
 */
export function goToHome(
  user: User | null,
  tenant: TenantPublicInfo | null,
  navigate: NavigateFunction,
): void {
  const path = resolveHomePath(user, tenant);
  if (path === '/dashboard') {
    navigate(path);
    return;
  }
  window.location.assign(path);
}
