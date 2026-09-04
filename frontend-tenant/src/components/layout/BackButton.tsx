import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface BackButtonProps {
  /** 'dark' para barras oscuras (navbar clásico), 'light' para barras claras (topbar kero) */
  variant?: 'dark' | 'light';
}

/**
 * Flecha de volver unificada de la app: aparece arriba a la izquierda en toda
 * pantalla autenticada que no es el Escritorio (/dashboard).
 *
 * Vuelve a la pantalla anterior cuando hay historial dentro de la sesión
 * (react-router mantiene history.state.idx > 0 tras cada push); si se entró
 * por deep-link (idx 0, sin historial) va al "padre lógico": la lista de
 * conversaciones para /conversations/:id, o el Escritorio para el resto.
 */
export const BackButton: React.FC<BackButtonProps> = ({ variant = 'dark' }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isLight = variant === 'light';

  const handleBack = () => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
      return;
    }
    const fallback = /^\/conversations\/.+/.test(location.pathname)
      ? '/conversations'
      : '/dashboard';
    // replace: al volver del fallback no se recrea la pantalla sin historial
    navigate(fallback, { replace: true });
  };

  // El Escritorio es la raíz: sin flecha (la navegación vive en la sidebar).
  if (!isAuthenticated || location.pathname === '/dashboard') return null;

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Volver"
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors focus:outline-none focus:ring-2 ${
        isLight
          ? 'text-gray-700 hover:bg-gray-100 focus:ring-gray-300'
          : 'text-white hover:bg-white/10 focus:ring-white/30'
      }`}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
  );
};

export default BackButton;
