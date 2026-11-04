import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  LogoutIcon,
  Settings05Icon,
  Share08Icon,
} from '@hugeicons/core-free-icons';
import {
  AppShell,
  SidebarInset,
  SidebarProvider,
  type NavItem,
  type ShellBrand,
  type ShellUser,
  type ShellUserAction,
} from '@mmanto/devbout-ui';
import { useAuth } from '../../hooks/useAuth';
import { useSidebarVisible } from '../../hooks/useSidebarVisible';
import { useTenant } from '../../hooks/useTenant';
import { readSidebarOpen } from '../../utils/sidebarState';
import { resolveAssetUrl } from '../../utils/assetUrl';
import type { UserRole } from '../../types/auth.types';
import type { TenantIndustry } from '../../types/tenant.types';
import { visibleNavGroups } from './navItems';
import { ShellHeader } from './ShellHeader';

interface DevboutAppLayoutProps {
  children: ReactNode;
}

/**
 * Traduce los grupos del manifiesto del tenant (`visibleNavGroups`) al `nav`
 * plano que consume `AppShell`. El `AppShell` pinta un único `SidebarGroup`
 * con `SidebarMenu`, así que los separadores del manifiesto se omiten y los
 * grupos quedan en el orden declarado. Los íconos del manifiesto son `<path>`
 * sueltos y se envuelven en el `<svg>` que espera `SidebarMenuButton`.
 */
function toAppShellNav(
  industry?: TenantIndustry,
  role?: UserRole,
): NavItem[] {
  return visibleNavGroups(industry, role)
    .flat()
    .map((item) => ({
      title: item.label,
      href: item.to,
      icon: (
        <svg
          className="size-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          {item.icon}
        </svg>
      ),
    }));
}

/**
 * Shell del tema «Panel»: usa el `AppShell` de `@mmanto/devbout-ui` con sus
 * valores por defecto (`AppHeader` con breadcrumb, contenedor de contenido y
 * sidebar colapsable a iconos). Solo se le pasa la data del tenant (nav,
 * marca y usuario); el chrome queda a cargo del paquete.
 *
 * El `SidebarProvider` vive acá y no en `App.tsx` para no envolver las rutas
 * públicas (Landing, Login, Chat) en su contenedor flex. Si el admin del
 * tenant apaga la barra lateral (`branding.sidebar_visible = false`), se
 * conserva el layout anterior sin sidebar: `AppShell` siempre monta la
 * sidebar y no expone un prop para ocultarla.
 */
export function DevboutAppLayout({ children }: DevboutAppLayoutProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const sidebarVisible = useSidebarVisible();

  const nav = toAppShellNav(tenant?.branding.industry, user?.role);

  const tenantName = tenant?.name || 'Backoffice';
  const logoHorizontal = resolveAssetUrl(
    tenant?.branding.logo_url_horizontal || tenant?.branding.logo_url,
  );
  const logoCompact = resolveAssetUrl(
    tenant?.branding.logo_url_vertical || tenant?.branding.logo_url,
  );
  const initial = tenantName.charAt(0).toUpperCase();

  const brand: ShellBrand = {
    title: tenantName,
    shortTitle: initial,
    href: '/dashboard',
    logo:
      logoHorizontal || logoCompact ? (
        <>
          {logoHorizontal ? (
            <img
              src={logoHorizontal}
              alt={tenantName}
              className="h-7 w-auto max-w-[9rem] object-contain group-data-[collapsible=icon]:hidden"
            />
          ) : null}
          {logoCompact ? (
            <img
              src={logoCompact}
              alt={tenantName}
              className="hidden size-5 object-contain group-data-[collapsible=icon]:block"
            />
          ) : null}
        </>
      ) : undefined,
  };

  const fullName =
    [user?.nombre, user?.apellido].filter(Boolean).join(' ') ||
    user?.username ||
    'Usuario';
  const contact = user?.email || user?.username || '';

  const handleLogout = () => {
    void logout();
    navigate('/login');
  };

  const actions: ShellUserAction[] = [
    {
      id: 'share',
      label: 'Compartir',
      icon: <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />,
      href: '/compartir',
    },
    {
      id: 'settings',
      label: 'Ajustes',
      icon: <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />,
      href: '/settings',
    },
    {
      id: 'logout',
      label: 'Cerrar sesión',
      icon: <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />,
      onSelect: handleLogout,
      separatorBefore: true,
    },
  ];

  const shellUser: ShellUser = {
    name: fullName,
    description: contact,
    avatarUrl: user?.avatar_url,
    actions,
  };

  const labels = {
    settings: 'Ajustes',
    logout: 'Cerrar sesión',
    home: 'Escritorio',
  };

  if (!sidebarVisible) {
    return (
      <SidebarProvider defaultOpen={readSidebarOpen()}>
        <SidebarInset className="bg-[#F8F9FD]">
          <ShellHeader showTrigger={false} />
          <div className="flex flex-1 flex-col pb-safe-area">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <AppShell
      nav={nav}
      brand={brand}
      user={shellUser}
      labels={labels}
      pathname={pathname}
      renderLink={(href) => <Link to={href} />}
    >
      {children}
    </AppShell>
  );
}
