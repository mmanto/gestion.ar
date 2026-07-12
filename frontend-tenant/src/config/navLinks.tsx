import type { ReactNode } from 'react';
import type { UserRole } from '../types/auth.types';

export interface NavLink {
  type?: 'link';
  to: string;
  label: string;
  icon: ReactNode;
  /** Si se omite, el link es visible para cualquier rol autenticado. */
  roles?: UserRole[];
}

/** Separador visual entre grupos de items del menú. */
export interface NavSeparator {
  type: 'separator';
}

export type NavItem = NavLink | NavSeparator;

export const NAV_LINKS: NavItem[] = [
  {
    to: '/dashboard', label: 'Escritorio',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l4-6 3 4 5-8" />,
  },
  {
    to: '/customers', label: 'Clientes',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m-1 4h1m4-8h1m-1 4h1m-1 4h1" />,
  },
  {
    to: '/conversations', label: 'Conversaciones',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
  },
  { type: 'separator' },
  {
    to: '/clients', label: 'Prospectos',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-3.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3.5-5.9" />,
  },
  {
    to: '/records', label: 'Expedientes',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  },
  {
    to: '/reports', label: 'Reportes',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2zM9 17V9m4 8V5m4 12v-6" />,
  },
  {
    to: '/modules', label: 'Módulos', roles: ['admin'],
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
  },
  {
    to: '/training', label: 'Entrenamiento', roles: ['admin', 'operativo'],
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.42A12.083 12.083 0 0112 20.055 12.083 12.083 0 015.84 10.58L12 14zm0 0v6" />,
  },
  {
    to: '/users', label: 'Usuarios', roles: ['admin'],
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
  },
];
