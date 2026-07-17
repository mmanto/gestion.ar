import api from './api';
import { tokenStorage } from './tokenStorage';
import type { LoginCredentials, LoginResponse, User } from '../types/auth.types';

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
