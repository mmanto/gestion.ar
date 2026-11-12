import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from './tokenStorage';
import { stripTenantBase, tenantPath } from '../config/internalTenant';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Agregar token a todas las peticiones
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await tokenStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Manejar errores de autenticación
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    // Si recibimos 401, limpiar token. Solo redirigir a login en rutas
    // protegidas del backoffice: en rutas públicas (chat del cliente, landing
    // de usuario, login/registro) un 401 no debe saltar al login — ocurre, por
    // ejemplo, cuando queda un token vencido del backoffice en el mismo origen
    // y el embed del chat de la landing lo comparte (AuthProvider.checkAuth).
    if (error.response?.status === 401) {
      await tokenStorage.removeItem('token');
      await tokenStorage.removeItem('user');

      // `stripTenantBase` quita el prefijo del tenant de la URL interna
      // (`/acme/login` -> `/login`) para comparar contra las rutas del Router.
      const path = stripTenantBase(window.location.pathname);
      const isPublicRoute =
        path === '/' ||
        path === '/login' ||
        path === '/register' ||
        path === '/registro' ||
        path.startsWith('/chat/') ||
        path.startsWith('/u/');
      if (!isPublicRoute) {
        // Navegación completa (no `navigate`): el interceptor no vive dentro del
        // Router y acá no hay acceso al basename; `tenantPath` lo repone.
        window.location.href = tenantPath('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
