import type { UserRole } from '../../types/auth.types';
import { useAuth } from '../../hooks/useAuth';

export interface UvPermissions {
  isAdmin: boolean;
  money: boolean;
  pay: boolean;
  plan: boolean;
  edit: boolean;
  remind: boolean;
  setup: boolean;
}

const ADMIN: UvPermissions = { isAdmin: true, money: true, pay: true, plan: true, edit: true, remind: true, setup: true };
/** demo «Ventas» (equipo.js): datos y recordatorios, sin cobros ni planes. */
const VENTAS: UvPermissions = { isAdmin: false, money: false, pay: false, plan: false, edit: true, remind: true, setup: false };

export function permissionsFor(role: UserRole | undefined): UvPermissions {
  return role === 'admin' ? ADMIN : VENTAS;
}

export function useUvPermissions(): UvPermissions {
  const { user } = useAuth();
  return permissionsFor(user?.role);
}
