import { Link } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@mmanto/devbout-ui';
import { useTenant } from '../../hooks/useTenant';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { NavMain } from './NavMain';
import { NavUser } from './NavUser';

/**
 * Sidebar del tema «Panel». Es el `AppSidebar` de devbout-ui/base con la marca
 * del tenant en el header: logos de Ajustes > Marca (horizontal expandido,
 * vertical/monograma cuando la barra queda en modo iconos).
 */
export function ShellSidebar() {
  const { tenant } = useTenant();

  const tenantName = tenant?.name || 'Backoffice';
  const logoHorizontal = resolveAssetUrl(
    tenant?.branding.logo_url_horizontal || tenant?.branding.logo_url,
  );
  const logoCompact = resolveAssetUrl(
    tenant?.branding.logo_url_vertical || tenant?.branding.logo_url,
  );
  const initial = tenantName.charAt(0).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="hover:bg-transparent active:bg-transparent"
              render={<Link to="/dashboard" aria-label={tenantName} />}
            >
              {logoHorizontal ? (
                <img
                  src={logoHorizontal}
                  alt={tenantName}
                  className="h-7 w-auto max-w-[9rem] object-contain group-data-[collapsible=icon]:hidden"
                />
              ) : (
                <span className="truncate font-editorial text-lg font-semibold uppercase tracking-[0.08em] group-data-[collapsible=icon]:hidden">
                  {tenantName}
                </span>
              )}
              <span className="hidden size-7 items-center justify-center rounded-md bg-sidebar-primary font-editorial text-sm font-semibold uppercase text-sidebar-primary-foreground group-data-[collapsible=icon]:flex">
                {logoCompact ? (
                  <img
                    src={logoCompact}
                    alt={tenantName}
                    className="size-5 object-contain"
                  />
                ) : (
                  initial
                )}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain />
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
