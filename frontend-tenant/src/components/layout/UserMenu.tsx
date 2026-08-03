import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAccentTheme } from '../../hooks/useAccentTheme';
// import { publicService } from '../../services/public.service';

interface UserMenuProps {
  /** Controla solo el estilo del botón disparador — 'dark' para fondos oscuros (navy), 'light' para fondos claros. */
  variant?: 'dark' | 'light';
}

export const UserMenu: React.FC<UserMenuProps> = ({ variant = 'dark' }) => {
  const { user, logout } = useAuth();
  const { accent } = useAccentTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // const [llmModel, setLlmModel] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // useEffect(() => {
  //   publicService.getLlmInfo().then((info) => setLlmModel(info.model)).catch(() => { });
  // }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cerrar dropdown al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || '';
  const avatarInitial = (user?.nombre || user?.username || '?').charAt(0).toUpperCase();

  const isLight = variant === 'light';

  const triggerClass = isLight
    ? 'flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200'
    : 'flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30';

  const avatarWrapClass = isLight
    ? 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0'
    : 'w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0';

  const avatarTextClass = isLight
    ? 'font-editorial font-semibold text-lg tracking-[0.08em] text-gray-900'
    : 'font-editorial font-semibold text-lg tracking-[0.08em] text-white';

  const usernameClass = isLight
    ? 'hidden sm:block text-sm font-medium text-gray-900 max-w-[120px] truncate'
    : 'hidden sm:block text-sm font-medium text-white/90 max-w-[120px] truncate';

  const chevronClass = isLight
    ? `w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`
    : `w-3.5 h-3.5 text-white/50 flex-shrink-0 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`;

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setMenuOpen(v => !v)} className={triggerClass}>
        <div className={avatarWrapClass}>
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={fullName} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className={avatarTextClass}>{avatarInitial}</span>
          )}
        </div>
        <span className={usernameClass}>
          Opciones
        </span>
        <svg className={chevronClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-[1.4rem] shadow-lg ring-1 ring-black/5 overflow-hidden z-50">

          {/* Banner superior — color de acento del template activo */}
          <div className="relative px-4 pt-4 pb-5" style={{ backgroundColor: accent }}>

            <div className="flex items-center gap-3 pr-16">
              <div className="w-12 h-12 bg-white/20 ring-2 ring-white/30 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-editorial font-semibold text-2xl tracking-[0.08em] text-white">
                    {avatarInitial}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{fullName}</p>
                {user?.email && (
                  <p className="text-xs text-white/70 truncate">{user.email}</p>
                )}
              </div>
            </div>
          </div>

          <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Mi cuenta</p>
          <div className="pb-1">
            <Link
              to="/settings"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Ajustes
            </Link>
            <button
              onClick={handleLogout}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-white bg-black/20 hover:bg-black/30 transition-colors"
            >
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Salir
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
