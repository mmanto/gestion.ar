import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from './tokenStorage';

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
    // Si recibimos 401, limpiar token y redirigir a login
    if (error.response?.status === 401) {
      await tokenStorage.removeItem('token');
      await tokenStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
