import type { ReactNode } from 'react';
import { Blocks, Bot, Building2, CreditCard } from 'lucide-react';
import { useModules } from '../modules/ModulesProvider';
import { useAuth } from '../hooks/useAuth';
import type { ModuleManifest } from '../modules/manifest';

export interface NavLink {
  to: string;
  label: string;
  icon: ReactNode;
}

/**
 * Los iconos son elementos de lucide-react completos (no `<path>` sueltos)
 * porque `SidebarMenuButton` (primitiva portada de devbout-ui/base) dimensiona
 * cualquier `svg` hijo con `[&_svg]:size-4`; el tamaño se pasa por atributo.
 * El manifiesto nombra el icono (texto) y acá se resuelve a un nodo.
 */
const MODULE_ICONS: Record<string, ReactNode> = {
  Bot: <Bot size={20} className="shrink-0" />,
};

const iconFor = (name: string): ReactNode => MODULE_ICONS[name] ?? <Blocks size={20} className="shrink-0" />;

/** Links propios de la consola, siempre presentes (no son de ningún módulo). */
const CORE_LINKS: NavLink[] = [
  {
    to: '/admin/tenants',
    label: 'Tenants',
    icon: <Building2 size={20} className="shrink-0" />,
  },
  {
    to: '/admin/plans',
    label: 'Planes',
    icon: <CreditCard size={20} className="shrink-0" />,
  },
];

/** Links de la consola que sólo ve administración general. */
const SUPER_ADMIN_ONLY_LINKS: Record<string, true> = { '/admin/plans': true };

/**
 * Navegación de la consola: los links core + los que aporta cada módulo
 * instalado (`admin.nav` del manifiesto). Apariencia vive en Ajustes, no acá.
 *
 * El partner (ADR-041) sólo administra tenants: no ve Planes ni las pantallas
 * de los módulos (su configuración técnica es de super_admin).
 */
export function buildNavLinks(modules: ModuleManifest[], isSuperAdmin: boolean): NavLink[] {
  const coreLinks = isSuperAdmin
    ? CORE_LINKS
    : CORE_LINKS.filter((link) => !SUPER_ADMIN_ONLY_LINKS[link.to]);

  const moduleLinks: NavLink[] = isSuperAdmin
    ? modules
        .map((manifest) => manifest.admin?.nav)
        .filter((nav): nav is NonNullable<typeof nav> => Boolean(nav))
        .map((nav) => ({ to: nav.to, label: nav.label, icon: iconFor(nav.icon) }))
    : [];

  return [...coreLinks, ...moduleLinks];
}

export function useNavLinks(): NavLink[] {
  const { user } = useAuth();
  return buildNavLinks(useModules(), user?.role === 'super_admin');
}
