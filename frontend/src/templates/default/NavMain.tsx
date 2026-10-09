import { Link, useLocation } from 'react-router-dom';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../../components/ui/sidebar';
import { NAV_LINKS } from '../../config/navLinks';

/**
 * Nav principal del template `default`. Es la rama sin submenús de
 * `components/nav-main.tsx` de devbout-ui/base: los ítems salen de `NAV_LINKS`
 * y cada uno es un `Link` de react-router vía el prop `render`.
 */
export function NavMain() {
  const { pathname } = useLocation();

  return (
    <SidebarGroup>
      <SidebarMenu>
        {NAV_LINKS.map(({ to, label, icon }) => (
          <SidebarMenuItem key={to}>
            <SidebarMenuButton
              isActive={pathname === to || pathname.startsWith(`${to}/`)}
              tooltip={label}
              render={<Link to={to} />}
            >
              {icon}
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
