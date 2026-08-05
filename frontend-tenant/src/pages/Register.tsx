import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { resolveAssetUrl } from '../utils/assetUrl';
import { RegisterForm } from '../components/auth/RegisterForm';

const PRIMARY = '#25357a';
const TEXT = '#0f172a';

export const Register: React.FC = () => {
  const { tenantId, tenant } = useTenant();
  const { register, loginWithProvider } = useAuth();
  const brand = tenant?.branding;
  const primaryColor = brand?.primary_color || PRIMARY;
  const logo = resolveAssetUrl(brand?.logo_url_vertical || brand?.logo_url);
  const tenantName = tenant?.name || 'Tu cuenta';

  if (tenantId == null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-sm" style={{ background: '#F8F9FD', color: TEXT }}>
        Este contenedor no tiene un tenant configurado.
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#F8F9FD' }}>
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver al inicio de sesión
        </Link>

        <RegisterForm
          tenantId={tenantId}
          branding={{ tenantName, primaryColor, logoUrl: logo }}
          submit={async (payload) => (await register(payload)).payment.url}
          google={(t) => loginWithProvider('google', t)}
        />
      </div>
    </div>
  );
};

export default Register;
