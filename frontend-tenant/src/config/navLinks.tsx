import type { ReactNode } from 'react';
import type { UserRole } from '../types/auth.types';
import type { TenantIndustry } from '../types/tenant.types';

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
    to: '/conversations', label: 'Conversaciones',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
  },
  { type: 'separator' },
  {
    to: '/clients', label: 'Clientes',
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
    to: '/users', label: 'Usuarios', roles: ['admin'],
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
  },
];

/**
 * Overrides de label por rubro (branding.industry, ver tenant.types.ts) —
 * distinto tenant, distinto vocabulario para el mismo concepto de negocio
 * (ej. ERMA es un centro de salud, "Clientes"/"Expedientes" heredado del
 * bot IUS original no tiene sentido ahí). Solo pisa el label, el resto del
 * item (ruta, ícono, roles) se mantiene igual.
 */
const LABEL_OVERRIDES_BY_INDUSTRY: Partial<Record<TenantIndustry, Record<string, string>>> = {
  salud: {
    '/clients': 'Pacientes',
    '/records': 'Historia Clínica',
  },
};

/** Links del menú lateral, con los labels adaptados al rubro del tenant. */
export function getNavLinks(industry?: TenantIndustry): NavItem[] {
  const overrides = industry ? LABEL_OVERRIDES_BY_INDUSTRY[industry] : undefined;
  if (!overrides) return NAV_LINKS;

  return NAV_LINKS.map((item) =>
    item.type === 'separator' || !(item.to in overrides)
      ? item
      : { ...item, label: overrides[item.to] }
  );
}
