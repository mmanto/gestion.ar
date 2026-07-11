import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthContextType, User, LoginCredentials, AuthProvider as SocialProvider } from '../types/auth.types';
import authService from '../services/auth.service';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Esta app (panel principal) es de uso exclusivo de administración general
// (ver ProtectedRoute). Un usuario 'admin'/'operativo' de tenant que loguea
// acá válidamente pero no puede acceder a ninguna ruta protegida generaba un
// loop infinito Login -> /admin/tenants -> Login (pantalla en blanco) — por
// eso el rol se valida acá, antes de establecer la sesión.
const ALLOWED_ROLE = 'super_admin';
const ROLE_NOT_ALLOWED_MESSAGE =
  'Esta cuenta no tiene acceso a este panel. Ingresá desde el backoffice de tu organización.';

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
      const storedToken = authService.getToken();
      const storedUser = authService.getUser();

      if (storedToken && storedUser) {
        // Verificar que el token sigue siendo válido
        try {
          const verifiedUser = await authService.verifyToken();
          if (verifiedUser.role !== ALLOWED_ROLE) {
            throw new Error(ROLE_NOT_ALLOWED_MESSAGE);
          }
          setToken(storedToken);
          setUser(verifiedUser);
          setIsAuthenticated(true);
        } catch {
          // Token inválido/expirado, o rol sin acceso a esta app
          authService.clearAuth();
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

      if (response.user.role !== ALLOWED_ROLE) {
        throw new Error(ROLE_NOT_ALLOWED_MESSAGE);
      }

      // Guardar token y usuario
      authService.saveToken(response.access_token);
      authService.saveUser(response.user);

      // Actualizar estado
      setToken(response.access_token);
      setUser(response.user);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const loginWithProvider = async (provider: SocialProvider) => {
    const { token: appToken } = await authService.loginWithProvider(provider);
    authService.saveToken(appToken);
    // El finalize no devuelve el usuario completo; lo obtenemos de /auth/me.
    const verifiedUser = await authService.verifyToken();
    if (verifiedUser.role !== ALLOWED_ROLE) {
      authService.clearAuth();
      throw new Error(ROLE_NOT_ALLOWED_MESSAGE);
    }
    authService.saveUser(verifiedUser);
    setToken(appToken);
    setUser(verifiedUser);
    setIsAuthenticated(true);
  };

  const logout = () => {
    authService.clearAuth();
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
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
