import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../types/auth.types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: UserRole[];
}

/**
 * Componente que protege rutas privadas del backoffice de tenant.
 * Si el usuario no está autenticado, redirige a /login.
 * Si se pasan `roles`, sólo deja pasar a admin (UsuarioAdmin) y/o operativo
 * (Usuario) del tenant, según corresponda a cada pantalla.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Mostrar loading mientras se verifica la autenticación
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, redirigir a login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si el rol no está autorizado para esta ruta
  if (roles && (!user || !roles.includes(user.role))) {
    return <Navigate to="/login" replace />;
  }

  // Si está autenticado y autorizado, renderizar el contenido protegido
  return <>{children}</>;
};
