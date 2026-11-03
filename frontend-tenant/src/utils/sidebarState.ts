/**
 * El `SidebarProvider` de @mmanto/devbout-ui persiste su estado en la cookie
 * `sidebar_state` (7 días). Se lee al montar el shell para que la barra no
 * "salte" de expandida a colapsada en cada recarga.
 */
const SIDEBAR_COOKIE_NAME = 'sidebar_state';

export function readSidebarOpen(): boolean {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE_NAME}=([^;]*)`)
  );
  return match ? match[1] === 'true' : true;
}
