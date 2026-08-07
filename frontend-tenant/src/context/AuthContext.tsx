import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthContextType, User, LoginCredentials, LoginResponse, AuthProvider as SocialProvider, RegisterPayload, RegisterPlan, RegisterResponse } from '../types/auth.types';
import authService from '../services/auth.service';
import api from '../services/api';
import { tokenStorage } from '../services/tokenStorage';
import { biometricService } from '../services/biometric.service';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar autenticación al cargar la app
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedToken = await authService.getToken();
      const storedUser = await authService.getUser();

      if (storedToken && storedUser) {
        // Verificar que el token sigue siendo válido
        try {
          const verifiedUser = await authService.verifyToken();
          setToken(storedToken);
          setUser(verifiedUser);
          setIsAuthenticated(true);
        } catch {
          // Token inválido o expirado
          await authService.clearAuth();
          setToken(null);
          setUser(null);
          setIsAuthenticated(false);
        }
      } else {
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authService.login(credentials);

      // Guardar token y usuario
      await authService.saveToken(response.access_token);
      await authService.saveUser(response.user);
      await tokenStorage.setItem('lastUsername', response.user.username);

      // Actualizar estado
      setToken(response.access_token);
      setUser(response.user);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (payload: RegisterPayload): Promise<RegisterResponse> => {
    try {
      const response = await authService.register(payload);
      await authService.saveToken(response.access_token);
      await authService.saveUser(response.user);
      await tokenStorage.setItem('lastUsername', response.user.username);
      setToken(response.access_token);
      setUser(response.user);
      setIsAuthenticated(true);
      return response;
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  };

  const loginWithProvider = async (provider: SocialProvider, tenantId: string, plan?: RegisterPlan) => {    try {
      const { token: appToken } = await authService.loginWithProvider(provider, tenantId, plan);
      await authService.saveToken(appToken);
      // El finalize no devuelve el usuario completo; lo obtenemos de /auth/me.
      const verifiedUser = await authService.verifyToken();
      await authService.saveUser(verifiedUser);
      await tokenStorage.setItem('lastUsername', verifiedUser.username);
      setToken(appToken);
      setUser(verifiedUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login with provider error:', error);
      throw error;
    }
  };

  const loginWithBiometric = async () => {
    try {
      // El plugin solo devuelve el secret tras validar la huella en el Keystore.
      const { secret, deviceId } = await biometricService.authenticate();
      const lastUsername = await tokenStorage.getItem('lastUsername');
      if (!lastUsername) {
        throw new Error('No se pudo determinar el usuario. Iniciá sesión con tu contraseña');
      }
      const { data } = await api.post<LoginResponse>('/auth/biometric/login', {
        username: lastUsername,
        device_id: deviceId,
        secret,
      });
      await authService.saveToken(data.access_token);
      await authService.saveUser(data.user);
      setToken(data.access_token);
      setUser(data.user);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Biometric login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await authService.clearAuth();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    loginWithProvider,
    loginWithBiometric,
    register,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
