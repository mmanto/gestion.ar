import Nango from '@nangohq/frontend';
import api from './api';
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
   * Login con Google o Microsoft vía Nango. Devuelve el app token.
   */
  async loginWithProvider(provider: AuthProvider): Promise<{ token: string }> {
    const { data: sess } = await api.post<{ sessionToken: string; nonce: string; provider: string }>(
      '/auth/oauth/connect/login/session', { provider },
    );
    const { connectionId } = await openNangoConnect(sess.sessionToken);
    const { data } = await api.post<{ token: string }>(
      '/auth/oauth/connect/login/finalize',
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
   * Guardar token en localStorage
   */
  saveToken(token: string): void {
    localStorage.setItem('token', token);
  },

  /**
   * Guardar usuario en localStorage
   */
  saveUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  },

  /**
   * Obtener token de localStorage
   */
  getToken(): string | null {
    return localStorage.getItem('token');
  },

  /**
   * Obtener usuario de localStorage
   */
  getUser(): User | null {
    const userStr = localStorage.getItem('user');
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
  clearAuth(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

export default authService;
