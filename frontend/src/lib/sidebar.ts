/**
 * `SidebarProvider` (components/ui/sidebar) persiste su estado en esta cookie
 * de 7 días. Se lee al montar el template para que el sidebar no "salte" de
 * expandido a colapsado en cada recarga.
 */
const SIDEBAR_COOKIE_NAME = 'sidebar_state';

export function readSidebarOpen(): boolean {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE_NAME}=([^;]*)`)
  );
  return match ? match[1] === 'true' : true;
}
