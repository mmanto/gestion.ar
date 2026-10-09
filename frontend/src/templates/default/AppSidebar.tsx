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
} from '../../components/ui/sidebar';
import { NavMain } from './NavMain';
import { NavUser } from './NavUser';

/**
 * Sidebar del template `default`, adaptado de `components/app-sidebar.tsx` de
 * devbout-ui/base (sin `TeamSwitcher`: gestion.ar no tiene concepto de equipos).
 */
export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="px-2" render={<Link to="/admin/tenants" />}>
              <span className="font-editorial text-lg font-semibold uppercase tracking-[0.08em] group-data-[collapsible=icon]:hidden">
                Gestiona
              </span>
              <span className="hidden font-editorial text-lg font-semibold uppercase group-data-[collapsible=icon]:inline">
                G
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
