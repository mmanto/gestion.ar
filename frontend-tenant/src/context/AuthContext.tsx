import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthContextType, User, LoginCredentials, LoginResponse, AuthProvider as SocialProvider, RegisterPayload, RegisterPlan, RegisterResponse } from '../types/auth.types';
import authService from '../services/auth.service';
import api from '../services/api';
import { tokenStorage } from '../services/tokenStorage';
import { biometricService } from '../services/biometric.service';
import { loginWithPasskey as passkeyLogin, signupWithPasskey as passkeySignup } from '../services/passkey.service';
import { assertTenantPanelRole } from '../utils/authRoles';
import { useTenant } from '../hooks/useTenant';

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
  const { tenant, isLoading: isTenantLoading } = useTenant();

  // Verificar autenticación al cargar la app. Se espera a que el tenant esté
  // resuelto: el storage de sesión está prefijado por tenant (en la URL interna
  // del apex todos comparten origen) y sin tenant no hay a quién pertenecer.
  useEffect(() => {
    if (isTenantLoading) return;
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTenantLoading]);

  /**
   * La sesión pertenece al tenant de esta página.
   *
   * El login por usuario/contraseña es global (el username es único en toda la
   * plataforma), así que sin este guard las credenciales de un tenant abrirían
   * sesión en la URL de otro — el backend valida el tenant del usuario contra el
   * de la página en los flujos de passkey, pero no en el login con contraseña.
   */
  const assertSameTenant = (candidate: User) => {
    if (!tenant?.tenant_id) return;
    if (candidate.tenant_id !== tenant.tenant_id) {
      throw new Error(
        'Este usuario pertenece a otra organización. Entrá desde la URL de tu organización.',
      );
    }
  };

  /**
   * Guard único de sesión del panel del tenant: rol que este SPA puede servir
   * + organización de la página. Se corre antes de guardar token/usuario en
   * todos los flujos (password, OAuth, passkey, biometría y rehidratación):
   * un rol ajeno a este backoffice (p. ej. `partner`) autentica igual, pero
   * ninguna ruta protegida lo admite — sin este guard, /dashboard lo rebota a
   * /login y /login lo re-manda a /dashboard: loop.
   */
  const assertSessionUser = (candidate: User) => {
    assertTenantPanelRole(candidate.role);
    assertSameTenant(candidate);
  };

  const checkAuth = async () => {
    if (!tenant) {
      // Sin tenant no hay organización a la que pertenecer (apex sin slug, ruta
      // reservada o tenant inexistente): no se consulta la API.
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }
    try {
      const storedToken = await authService.getToken();
      const storedUser = await authService.getUser();

      if (storedToken && storedUser) {
        // Verificar que el token sigue siendo válido
        try {
          const verifiedUser = await authService.verifyToken();
          assertSessionUser(verifiedUser);
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
      // Antes de tocar el storage: si el usuario es de otra organización, no se
      // guarda nada.
      assertSessionUser(response.user);

      // Guardar token y usuario
      await authService.saveToken(response.access_token);
      // El login no devuelve el usuario completo (plan/suscripción); se
      // obtiene de /auth/me como en loginWithProvider para que el tag del
      // plan en el menú del avatar aparezca sin depender de un reload.
      let fullUser = response.user;
      try {
        fullUser = await authService.verifyToken();
      } catch {
        // El token recién emitido ya validó la sesión; si /auth/me falla por
        // red se usa el usuario del login y el próximo arranque refresca.
      }
      await authService.saveUser(fullUser);
      await tokenStorage.setItem('lastUsername', fullUser.username);

      // Actualizar estado
      setToken(response.access_token);
      setUser(fullUser);
      setIsAuthenticated(true);
      // El usuario recién autenticado: el caller decide a qué pantalla mandarlo
      // según su rol (ver utils/homePath).
      return fullUser;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (payload: RegisterPayload): Promise<RegisterResponse> => {
    try {
      const response = await authService.register(payload);
      assertSessionUser(response.user);
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
      try {
        assertSessionUser(verifiedUser);
      } catch (error) {
        // Autenticó pero este panel no lo admite (rol u organización): no se
        // deja el token guardado.
        await authService.clearAuth();
        throw error;
      }
      await authService.saveUser(verifiedUser);
      await tokenStorage.setItem('lastUsername', verifiedUser.username);
      setToken(appToken);
      setUser(verifiedUser);
      setIsAuthenticated(true);
      return verifiedUser;
    } catch (error) {
      console.error('Login with provider error:', error);
      throw error;
    }
  };

  /**
   * Guarda el token de un flujo que ya autenticó y rehidrata el usuario.
   * Los flujos de passkey (login y alta) no devuelven el usuario completo, así
   * que se trae de /auth/me igual que en loginWithProvider. Devuelve el usuario
   * para que el caller resuelva la pantalla de inicio según su rol.
   */
  const applySession = async (appToken: string): Promise<User> => {
    await authService.saveToken(appToken);
    const verifiedUser = await authService.verifyToken();
    try {
      assertSessionUser(verifiedUser);
    } catch (error) {
      // El token es válido pero este panel no lo admite (rol u organización):
      // no se deja sesión abierta.
      await authService.clearAuth();
      throw error;
    }
    await authService.saveUser(verifiedUser);
    await tokenStorage.setItem('lastUsername', verifiedUser.username);
    setToken(appToken);
    setUser(verifiedUser);
    setIsAuthenticated(true);
    return verifiedUser;
  };

  const loginWithPasskey = async (tenantId: string, username?: string) => {
    try {
      const { token: appToken } = await passkeyLogin(tenantId, username);
      return await applySession(appToken);
    } catch (error) {
      console.error('Login with passkey error:', error);
      throw error;
    }
  };

  const signupWithPasskey = async (
    tenantId: string,
    options: { nombre: string; plan?: RegisterPlan },
  ) => {
    try {
      const { token: appToken } = await passkeySignup(tenantId, options);
      return await applySession(appToken);
    } catch (error) {
      console.error('Signup with passkey error:', error);
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
      assertSessionUser(data.user);
      await authService.saveToken(data.access_token);
      await authService.saveUser(data.user);
      setToken(data.access_token);
      setUser(data.user);
      setIsAuthenticated(true);
      return data.user;
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
    loginWithPasskey,
    signupWithPasskey,
    loginWithBiometric,
    register,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
