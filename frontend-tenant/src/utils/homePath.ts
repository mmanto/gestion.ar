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
 * Destino que pidió la página que mandó al login (`?next=`), para volver a
 * donde estaba el usuario. La landing de pachoteayuda lo usa: el mapa de
 * reclamos manda a `/login?next=/reclamos/?nuevo=1` cuando alguien sin sesión
 * quiere marcar un reclamo, y espera volver al mapa después de entrar.
 *
 * Solo acepta caminos del propio sitio (`/...`, y no `//host`): un `next`
 * absoluto sería un open redirect.
 */
export function resolveNextPath(search: string = window.location.search): string | null {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

/**
 * Navega a esa pantalla. Las configuradas (p. ej. `/reclamos`) viven fuera del
 * SPA — las sirve la landing — así que requieren navegación completa; para
 * `/dashboard` se mantiene la navegación client-side y no se recarga el bundle.
 *
 * El alta de cuenta no pasa por acá: sigue yendo al panel (`/dashboard`).
 */
export function goToHome(
  user: User | null,
  tenant: TenantPublicInfo | null,
  navigate: NavigateFunction,
): void {
  // El `next` explícito gana sobre el home del rol: lo pidió la página de la
  // que venía el usuario (navegación completa, la sirve la landing).
  const next = resolveNextPath();
  if (next) {
    window.location.assign(next);
    return;
  }
  const path = resolveHomePath(user, tenant);
  if (path === '/dashboard') {
    navigate(path);
    return;
  }
  window.location.assign(path);
}
