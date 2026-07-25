import Nango from '@nangohq/frontend';
import api from './api';
import { tokenStorage } from './tokenStorage';
import type { AuthProvider, LoginCredentials, LoginResponse, User } from '../types/auth.types';

// URLs del Nango self-hosted, visibles desde el browser.
const NANGO_CONNECT_URL = import.meta.env.VITE_NANGO_CONNECT_URL || 'http://localhost:3009';
const NANGO_API_URL = import.meta.env.VITE_NANGO_API_URL || 'http://localhost:3003';

/** Abre el Connect UI de Nango y resuelve con el connectionId cuando el usuario autoriza. */
function openNangoConnect(sessionToken: string): Promise<{ connectionId: string; providerConfigKey: string }> {
  return new Promise((resolve, reject) => {
    const nango = new Nango();
    const connect = nango.openConnectUI({
      baseURL: NANGO_CONNECT_URL,
      apiURL: NANGO_API_URL,
      onEvent: (event) => {
        if (event.type === 'connect') {
          resolve({ connectionId: event.payload.connectionId, providerConfigKey: event.payload.providerConfigKey });
        } else if (event.type === 'close') {
          reject(new Error('cancelled'));
        } else if (event.type === 'error') {
          reject(new Error(event.payload.errorMessage));
        }
      },
    });
    connect.setSessionToken(sessionToken);
  });
}

const authService = {
  /**
   * Login con username y password
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    // FastAPI espera FormData para el login
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await api.post<LoginResponse>('/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  /**
   * Login con Google o Microsoft vía Nango, scoped al tenant actual.
   * Si es la primera vez que este email entra a este tenant, la cuenta se
   * crea automáticamente (self-service, rol operativo).
   */
  async loginWithProvider(provider: AuthProvider, tenantId: string): Promise<{ token: string }> {
    const { data: sess } = await api.post<{ sessionToken: string; nonce: string; provider: string }>(
      '/tenant/oauth/connect/login/session', { tenant_id: tenantId, provider },
    );
    const { connectionId } = await openNangoConnect(sess.sessionToken);
    const { data } = await api.post<{ token: string }>(
      '/tenant/oauth/connect/login/finalize',
      { connectionId, provider, nonce: sess.nonce },
    );
    return { token: data.token };
  },

  /**
   * Verificar token y obtener usuario actual
   */
  async verifyToken(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  /**
   * Guardar token (Secure Storage en nativo, localStorage en web)
   */
  async saveToken(token: string): Promise<void> {
    await tokenStorage.setItem('token', token);
  },

  /**
   * Guardar usuario (Secure Storage en nativo, localStorage en web)
   */
  async saveUser(user: User): Promise<void> {
    await tokenStorage.setItem('user', JSON.stringify(user));
  },

  /**
   * Obtener token
   */
  async getToken(): Promise<string | null> {
    return tokenStorage.getItem('token');
  },

  /**
   * Obtener usuario
   */
  async getUser(): Promise<User | null> {
    const userStr = await tokenStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  /**
   * Limpiar token y usuario (logout)
   */
  async clearAuth(): Promise<void> {
    await tokenStorage.removeItem('token');
    await tokenStorage.removeItem('user');
  },
};

export default authService;
