import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { LoginForm } from '../components/auth/LoginForm';
import { resolveAssetUrl } from '../utils/assetUrl';

export const Login: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const logoHoriz = resolveAssetUrl(tenant?.branding.logo_url);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const primaryColor = tenant?.branding.primary_color || '#25357a';
  const tenantName = tenant?.name || 'Tu cuenta';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: '#F8F9FD' }}
    >
      <div className="max-w-md w-full">
        <div
          className="bg-white rounded-3xl shadow-2xl shadow-black/15 border overflow-hidden"
          style={{ borderColor: '#3b82f6' }}
        >
          {/* Header de marca (paridad con el registro) */}
          <div
            className="px-8 pt-7 pb-8 flex items-center gap-4"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, #3b82f6)` }}
          >
            <span className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              {logoHoriz ? (
                <img
                  src={logoHoriz}
                  alt={tenantName}
                  className="w-8 h-8 object-contain"
                  style={{ filter: 'brightness(0) invert(1)' }}
                />
              ) : (
                <span className="text-white font-extrabold text-xl">
                  {tenantName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <div>
              <span className="inline-block text-[11px] font-bold tracking-wide text-white bg-white/20 rounded-full px-2.5 py-1 mb-1">
                {tenantName}
              </span>
              <p className="text-2xl font-extrabold text-white leading-none">Inicia sesión</p>
            </div>
          </div>

          <div className="px-8 py-7">
            <LoginForm />
            <div className="mt-6 text-center text-sm text-gray-500">
              ¿No tenés cuenta?{' '}
              <Link
                to="/registro"
                className="font-semibold hover:underline"
                style={{ color: primaryColor }}
              >
                Crea una
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
