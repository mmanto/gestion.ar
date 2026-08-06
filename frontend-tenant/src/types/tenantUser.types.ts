/**
 * Tenant user types - gestión de usuarios (UsuarioAdmin/Usuario) del propio
 * tenant, ver backend/app/routers/tenant_router.py (/api/tenant/users)
 */

export type TenantUserRole = 'admin' | 'operativo';
// Estado de la suscripción del plan del usuario: pending → approved/active.
// El admin del tenant puede modificarlo (aprobar un plan pendiente).
export type TenantSubscriptionStatus = 'pending' | 'approved' | 'active';

export interface TenantUser {
  username: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  tenant_id?: string | null;
  role: string;
  disabled: boolean;
  requested_plan_id?: string | null;
  subscription_status?: TenantSubscriptionStatus;
}

export interface TenantUserCreate {
  username: string;
  password: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  role: TenantUserRole;
}

export interface TenantUserUpdate {
  role?: TenantUserRole;
  disabled?: boolean;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  subscription_status?: TenantSubscriptionStatus;
}

export interface TenantUsersResponse {
  success: boolean;
  users: TenantUser[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
