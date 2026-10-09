import type { ReactNode } from 'react';
import { Bot, Building2, CreditCard, Palette } from 'lucide-react';

export interface NavLink {
  to: string;
  label: string;
  icon: ReactNode;
}

/**
 * Los iconos son elementos de lucide-react completos (no `<path>` sueltos)
 * porque `SidebarMenuButton` (primitiva portada de devbout-ui/base) dimensiona
 * cualquier `svg` hijo con `[&_svg]:size-4`; el tamaño se pasa por atributo.
 */
export const NAV_LINKS: NavLink[] = [
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
  {
    to: '/bots',
    label: 'Agentes',
    icon: <Bot size={20} className="shrink-0" />,
  },
  {
    to: '/apariencia',
    label: 'Apariencia',
    icon: <Palette size={20} className="shrink-0" />,
  },
];
