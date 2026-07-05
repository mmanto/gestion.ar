import type { ReactNode } from 'react';

export interface NavLink {
  to: string;
  label: string;
  icon: ReactNode;
}

export const NAV_LINKS: NavLink[] = [
  {
    to: '/clients', label: 'Contactos',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-3.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3.5-5.9" />,
  },
  {
    to: '/conversations', label: 'Conversaciones',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
  },
  {
    to: '/bots', label: 'Agentes',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M4 9h16M5 7h14a1 1 0 011 1v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8a1 1 0 011-1zm3 6h.01M15 13h.01M8.5 17h7" />,
  },
  {
    to: '/dashboard', label: 'Estadísticas',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l4-6 3 4 5-8" />,
  },
];
