export type AuthProvider = 'google' | 'microsoft';
export type UserRole = 'super_admin' | 'admin' | 'operativo';

export interface User {
  username: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string;
  tenant_id?: string | null;
  role: UserRole;
  // Plan al que está suscripto el usuario y su estado (vienen de /auth/me).
  requested_plan_id?: string | null;
  subscription_status?: 'pending' | 'approved' | 'active';
  plan_name?: string | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type RegisterPlan = 'mensual' | 'anual';

export interface RegisterPayload {
  tenant_id: string;
  nombre: string;
  email: string;
  password: string;
  plan: RegisterPlan;
}

export interface RegisterPayment {
  plan: RegisterPlan;
  amount: number;
  price_label: string;
  url: string;
}

export interface RegisterResponse {
  access_token: string;
  token_type: string;
  user: User;
  payment: RegisterPayment;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithProvider: (provider: AuthProvider, tenantId: string, plan?: RegisterPlan) => Promise<void>;
  loginWithBiometric: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}
