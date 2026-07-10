import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { toastBus } from './toastBus';
import { getErrorMessage } from '../utils/errorMessage';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Agregar token a todas las peticiones
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
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
  (error: AxiosError) => {
    // Si recibimos 401, limpiar token y redirigir a login
    if (error.response?.status === 401) {
      const onLoginPage = window.location.pathname === '/login';
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // En /login el formulario ya muestra su propio mensaje inline para este
      // mismo status (credenciales incorrectas); en cualquier otra pantalla es
      // una sesión vencida y el usuario necesita saber por qué lo mandamos afuera.
      if (!onLoginPage) {
        toastBus.emit('Tu sesión expiró. Iniciá sesión nuevamente.', 'error');
        // Pequeño delay para que el toast alcance a pintarse antes del reload
        // (window.location.href navega de inmediato y se lleva el DOM puesto).
        setTimeout(() => {
          window.location.href = '/login';
        }, 1200);
      }
    } else {
      // Notificar siempre al usuario: sin esto, errores como validaciones (422)
      // o conflictos (400/409) quedaban silenciosos si la pantalla que hizo el
      // request no los manejaba explícitamente.
      toastBus.emit(getErrorMessage(error), 'error');
    }
    return Promise.reject(error);
  }
);

export default api;
