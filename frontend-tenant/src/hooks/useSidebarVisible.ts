import { useTenant } from './useTenant';

/**
 * Si la barra lateral de navegación debe mostrarse — lo decide el admin del
 * tenant en Ajustes > Marca (tenant.branding.sidebar_visible), no es una
 * preferencia de usuario/navegador. Default: true.
 */
export function useSidebarVisible(): boolean {
  const { tenant } = useTenant();
  return tenant?.branding.sidebar_visible ?? true;
}
