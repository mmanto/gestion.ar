import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { LoginForm } from '../components/auth/LoginForm';

export const Login: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const logo = tenant?.branding.logo_url || tenant?.branding.logo_url;
  

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const primaryColor = tenant?.branding.primary_color || '#25357a';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: '#F8F9FD' }}
    >
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center gap-6">

          {/* Marca */}
          <div className="flex flex-col items-center gap-3">
            {logo ? (
              <img src={logo} alt={tenant?.name} className="h-32 w-32 rounded object-contain" />
            ) : (
              <div
                className="h-24 w-24 rounded-lg flex items-center justify-center text-white font-semibold text-4xl"
                style={{ background: primaryColor }}
              >
                {(tenant?.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Encabezado */}
          <div className="text-center">
            <h2 className="text-xl font-semibold" style={{ color: '#0f172a' }}>
              Hola!
            </h2>
          </div>

          {/* Formulario */}
          <div className="w-full">
            <LoginForm />
            {/* <div className="mt-5 text-center text-sm" style={{ color: '#64748b' }}>
              ¿No tenés cuenta?{' '}
              <Link to="/registro" className="font-semibold hover:underline" style={{ color: primaryColor }}>
                Crea una
              </Link>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
};
