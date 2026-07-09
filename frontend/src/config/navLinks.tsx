import type { ReactNode } from 'react';

export interface NavLink {
  to: string;
  label: string;
  icon: ReactNode;
}

export const NAV_LINKS: NavLink[] = [
  {
    to: '/admin/tenants', label: 'Tenants',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01" />,
  },
  {
    to: '/admin/plans', label: 'Planes',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zM7 15h4" />,
  },
  {
    to: '/bots', label: 'Agentes',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M4 9h16M5 7h14a1 1 0 011 1v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8a1 1 0 011-1zm3 6h.01M15 13h.01M8.5 17h7" />,
  },
];
