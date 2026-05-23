import api from './api';
import type { LoginCredentials, LoginResponse, User, RegisterCredentials, RegisterResponse } from '../types/auth.types';

const authService = {
  /**
   * Registrar un nuevo usuario
   */
  async register(credentials: RegisterCredentials): Promise<RegisterResponse> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);
    if (credentials.email) {
      formData.append('email', credentials.email);
    }

    const response = await api.post<RegisterResponse>('/auth/register', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

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
