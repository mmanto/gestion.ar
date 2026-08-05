import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthContextType, User, LoginCredentials, AuthProvider as SocialProvider, RegisterPayload, RegisterResponse } from '../types/auth.types';
import authService from '../services/auth.service';

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
      setToken(response.access_token);
      setUser(response.user);
      setIsAuthenticated(true);
      return response;
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  };

  const loginWithProvider = async (provider: SocialProvider, tenantId: string) => {    try {
      const { token: appToken } = await authService.loginWithProvider(provider, tenantId);
      await authService.saveToken(appToken);
      // El finalize no devuelve el usuario completo; lo obtenemos de /auth/me.
      const verifiedUser = await authService.verifyToken();
      await authService.saveUser(verifiedUser);
      setToken(appToken);
      setUser(verifiedUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login with provider error:', error);
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
    register,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
