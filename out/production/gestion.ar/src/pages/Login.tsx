import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { LoginForm } from '../components/auth/LoginForm';

export const Login: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const primaryColor = tenant?.branding.primary_color || '#25357a';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: '#F2F1F1' }}
    >
      <div
        className="max-w-md w-full rounded-xl p-8 shadow-lg"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}
      >
        <div className="flex flex-col items-center gap-6">

          {/* Marca */}
          <div className="flex items-center gap-3">
            {tenant?.branding.logo_url ? (
              <img src={tenant.branding.logo_url} alt={tenant.name} className="h-12 w-12 rounded object-contain" />
            ) : (
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-semibold text-xl"
                style={{ background: primaryColor }}
              >
                {(tenant?.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-xl font-semibold" style={{ color: primaryColor }}>
              {tenant?.name || 'Backoffice'}
            </p>
          </div>

          {/* Encabezado */}
          <div className="text-center">
            <h2 className="text-xl font-semibold" style={{ color: '#0f172a' }}>
              Iniciar sesión
            </h2>
            <p className="text-sm mt-1" style={{ color: '#64748b' }}>
              Accede a tu cuenta para continuar
            </p>
          </div>

          {/* Formulario */}
          <div className="w-full">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
};
