import type { ReactNode } from 'react';
import { getNavLinks } from '../../config/navLinks';
import type { UserRole } from '../../types/auth.types';
import type { TenantIndustry } from '../../types/tenant.types';

/** Item del menú del shell, ya resuelto (sin separadores ni items sin rol). */
export interface ShellNavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

/**
 * Traduce el manifiesto de navegación del tenant (`config/navLinks.tsx`) a los
 * grupos que pinta el shell de devbout-ui: los separadores del manifiesto
 * pasan a ser grupos (`SidebarGroup`) y los items sin rol visible se filtran.
 *
 * Es el único punto que conoce el manifiesto: ni el sidebar ni el header de
 * breadcrumbs saben de roles/rubros.
 */
export function visibleNavGroups(
  industry?: TenantIndustry,
  role?: UserRole,
): ShellNavItem[][] {
  const groups: ShellNavItem[][] = [[]];

  for (const item of getNavLinks(industry)) {
    if (item.type === 'separator') {
      if (groups[groups.length - 1].length > 0) groups.push([]);
      continue;
    }
    if (item.roles && (!role || !item.roles.includes(role))) continue;

    groups[groups.length - 1].push({ to: item.to, label: item.label, icon: item.icon });
  }

  return groups.filter((group) => group.length > 0);
}

/** Etiqueta de la sección actual para el breadcrumb del header. */
export function sectionLabel(pathname: string, groups: ShellNavItem[][]): string {
  const items = groups.flat();

  const exact = items.find((item) => item.to === pathname);
  if (exact) return exact.label;

  const parent = items.find((item) => pathname.startsWith(`${item.to}/`));
  if (parent) return parent.label;

  const segment = pathname.split('/').filter(Boolean)[0];
  return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Escritorio';
}
