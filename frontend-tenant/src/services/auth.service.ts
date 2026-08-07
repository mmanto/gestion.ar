import Nango from '@nangohq/frontend';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import api from './api';
import { tokenStorage } from './tokenStorage';
import type { AuthProvider, LoginCredentials, LoginResponse, RegisterPayload, RegisterPlan, RegisterResponse, User } from '../types/auth.types';

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

// ── Login OAuth nativo (Android/iOS) ────────────────────────────────────────
//
// En web, el popup de Google se abre en un iframe controlado por nuestra
// propia página (openNangoConnect arriba), y Nango le avisa el resultado vía
// window.opener.postMessage. En el WebView de Capacitor eso muestra el login
// de Google "en frío" (sin la sesión ya iniciada del dispositivo) y sin
// selector de cuentas, porque es un WebView aislado, no el Chrome real del
// teléfono.
//
// Por eso en nativo se abre el `connectLink` de Nango (un link "mágico" que
// hace ese mismo flujo completo standalone, sin iframe) en Chrome Custom
// Tabs vía @capacitor/browser — eso sí comparte la sesión de Google del
// dispositivo. El problema es que Custom Tabs es un proceso aparte de Chrome:
// no hay window.opener hacia nuestro WebView, así que el postMessage de
// Nango nunca llega. En su lugar, el backend se entera por un webhook de
// Nango (ver tenant_oauth_router.py) y acá se hace polling a
// /connect/login/status hasta ver el resultado.
const LOGIN_POLL_INTERVAL_MS = 1500;
const LOGIN_POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos

interface LoginStatusResponse {
  status: 'pending' | 'done' | 'error';
  token?: string;
  message?: string;
}

async function pollLoginStatus(nonce: string, isCancelled: () => boolean): Promise<{ token: string }> {
  const deadline = Date.now() + LOGIN_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LOGIN_POLL_INTERVAL_MS));

    let status: LoginStatusResponse;
    try {
      const { data } = await api.get<LoginStatusResponse>('/tenant/oauth/connect/login/status', {
        params: { nonce },
      });
      status = data;
    } catch {
      // Error de red transitorio: el poll lanza Network Error cuando la
      // WebView retoma tras cerrarse el Chrome Custom Tab (la primera request
      // se aborta). No es una falla del login — se reintenta hasta el deadline
      // en vez de tirar todo el flujo a la basura.
      continue;
    }

    if (status.status === 'done' && status.token) {
      return { token: status.token };
    }
    if (status.status === 'error') {
      throw new Error(status.message || 'No se pudo completar el login');
    }
    // Sigue "pending": si el usuario ya cerró el Custom Tab, esta fue la
    // última chance de encontrar el resultado (el webhook puede llegar justo
    // cuando vuelve a la app) — si tampoco acá, se lo trata como cancelado.
    if (isCancelled()) {
      throw new Error('cancelled');
    }
  }
  throw new Error('El login no se completó a tiempo. Intenta nuevamente');
}

async function loginWithProviderNative(connectLink: string, nonce: string): Promise<{ token: string }> {
  // El connect_link que devuelve el Nango self-hosted no incluye `apiURL` —
  // sin eso, la SPA de Connect UI abierta standalone cae por default a
  // api.nango.dev (la nube de Nango, no nuestro self-hosted) y queda en
  // blanco porque ese sessionToken no existe ahí. La propiedad se llama
  // "apiURL" (mismo nombre que usa @nangohq/frontend, ver createIframe en
  // node_modules/@nangohq/frontend/dist/connectUI.js).
  const url = new URL(connectLink);
  url.searchParams.set('apiURL', NANGO_API_URL);
  await Browser.open({ url: url.href });

  let closedByUser = false;
  const listener = await Browser.addListener('browserFinished', () => {
    closedByUser = true;
  });

  try {
    const result = await pollLoginStatus(nonce, () => closedByUser);
    return result;
  } finally {
    await listener.remove();
    await Browser.close().catch(() => {});
  }
}

const authService = {
  /**
   * Autoregistro público de un admin para el tenant actual (flujo
   * "Crea tu cuenta"). Devuelve token + usuario + URL de pago del plan.
   */
  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    const response = await api.post<RegisterResponse>('/auth/register', payload);
    return response.data;
  },

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
  async loginWithProvider(provider: AuthProvider, tenantId: string, plan?: RegisterPlan): Promise<{ token: string }> {
    const { data: sess } = await api.post<{ sessionToken: string; connectLink: string; nonce: string; provider: string }>(
      '/tenant/oauth/connect/login/session', { tenant_id: tenantId, provider },
    );

    if (Capacitor.isNativePlatform()) {
      return loginWithProviderNative(sess.connectLink, sess.nonce);
    }

    const { connectionId } = await openNangoConnect(sess.sessionToken);
    const { data } = await api.post<{ token: string }>(
      '/tenant/oauth/connect/login/finalize',
      { connectionId, provider, nonce: sess.nonce, plan },
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
