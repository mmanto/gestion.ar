import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@mmanto/devbout-ui';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { visibleNavGroups } from './navItems';

/** Iconos del manifiesto (`config/navLinks.tsx`) son `<path>` sueltos: acá se
 * envuelven en el `<svg>` del shell. */
function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {children}
    </svg>
  );
}

/**
 * Navegación principal del shell, equivalente a `NavMain` de devbout-ui/base:
 * los ítems salen del manifiesto del tenant (`visibleNavGroups`), cada uno es
 * un `Link` de react-router vía el prop `render`, y los separadores del
 * manifiesto se pintan como grupos del sidebar.
 */
export function NavMain() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const groups = visibleNavGroups(tenant?.branding.industry, user?.role);

  return (
    <>
      {groups.map((group, index) => (
        <SidebarGroup key={group[0]?.to ?? index}>
          {index > 0 && <SidebarSeparator className="mx-0 my-1" />}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
                    tooltip={item.label}
                    render={<Link to={item.to} />}
                  >
                    <NavIcon>{item.icon}</NavIcon>
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
