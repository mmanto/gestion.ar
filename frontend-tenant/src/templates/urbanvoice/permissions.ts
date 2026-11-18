import type { UserRole } from '../../types/auth.types';
import { useAuth } from '../../hooks/useAuth';

export interface UvPermissions {
  isAdmin: boolean;
  /** Rol `partner`: dueño del tenant base que administra sus clientes. */
  isPartner: boolean;
  money: boolean;
  pay: boolean;
  plan: boolean;
  edit: boolean;
  remind: boolean;
  setup: boolean;
}

const ADMIN: UvPermissions = { isAdmin: true, isPartner: false, money: true, pay: true, plan: true, edit: true, remind: true, setup: true };
/** demo «Ventas» (equipo.js): datos y recordatorios, sin cobros ni planes. */
const VENTAS: UvPermissions = { isAdmin: false, isPartner: false, money: false, pay: false, plan: false, edit: true, remind: true, setup: false };
/** Rol `partner`: administra el tenant base y sus clientes (tenants hijos). */
const PARTNER: UvPermissions = { ...ADMIN, isPartner: true };

export function permissionsFor(role: UserRole | undefined): UvPermissions {
  if (role === 'partner') return PARTNER;
  return role === 'admin' ? ADMIN : VENTAS;
}

export function useUvPermissions(): UvPermissions {
  const { user } = useAuth();
  return permissionsFor(user?.role);
}
