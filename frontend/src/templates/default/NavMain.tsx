import { Link, useLocation } from 'react-router-dom';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../../components/ui/sidebar';
import { useNavLinks } from '../../config/navLinks';

/**
 * Nav principal del template `default`. Es la rama sin submenús de
 * `components/nav-main.tsx` de devbout-ui/base: los ítems salen del manifiesto
 * de módulos (+ los links core), y cada uno es un `Link` de react-router vía
 * el prop `render`.
 */
export function NavMain() {
  const { pathname } = useLocation();
  const navLinks = useNavLinks();

  return (
    <SidebarGroup>
      <SidebarMenu>
        {navLinks.map(({ to, label, icon }) => (
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
