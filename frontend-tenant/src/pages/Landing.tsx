import React from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';

/**
 * Landing pública de este tenant — cada contenedor de frontend-tenant sirve a
 * un único tenant (ver TenantContext), así que esta página se pinta con su
 * marca (nombre/logo/tagline) en vez de la marca de gestion.ar.
 */
export const Landing: React.FC = () => {
  const { tenant, isLoading, error } = useTenant();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-400" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-700 text-center max-w-md">
          {error || 'No se pudo cargar este sitio.'}
        </p>
      </div>
    );
  }

  const primaryColor = tenant.branding.primary_color || '#25357a';

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        {tenant.branding.logo_url ? (
          <img src={tenant.branding.logo_url} alt={tenant.name} className="h-10 w-10 rounded object-contain" />
        ) : (
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold"
            style={{ background: primaryColor }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-lg font-medium text-gray-900">{tenant.name}</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-lg text-center">
          <h1 className="text-3xl sm:text-4xl font-light text-gray-900 mb-4">
            {tenant.name}
          </h1>
          {tenant.branding.tagline && (
            <p className="text-lg text-gray-800 mb-8">{tenant.branding.tagline}</p>
          )}
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-white font-medium transition-opacity hover:opacity-90"
            style={{ background: primaryColor }}
          >
            Ingresar al backoffice
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 px-6 py-4 text-center text-xs text-gray-400">
        {tenant.name} © {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default Landing;
