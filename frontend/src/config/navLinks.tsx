import type { ReactNode } from 'react';
import { Blocks, Bot, Building2, CreditCard } from 'lucide-react';
import { useModules } from '../modules/ModulesProvider';
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

/**
 * Navegación de la consola: los links core + los que aporta cada módulo
 * instalado (`admin.nav` del manifiesto). Apariencia vive en Ajustes, no acá.
 */
export function buildNavLinks(modules: ModuleManifest[]): NavLink[] {
  const moduleLinks: NavLink[] = modules
    .map((manifest) => manifest.admin?.nav)
    .filter((nav): nav is NonNullable<typeof nav> => Boolean(nav))
    .map((nav) => ({ to: nav.to, label: nav.label, icon: iconFor(nav.icon) }));

  return [...CORE_LINKS, ...moduleLinks];
}

export function useNavLinks(): NavLink[] {
  return buildNavLinks(useModules());
}
