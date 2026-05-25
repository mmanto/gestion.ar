import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { publicService } from '../../services/public.service';

const NAV_LINKS = [
  { to: '/clients',       label: 'Ciudadanos'     },
  { to: '/conversations', label: 'Conversaciones' },
  { to: '/bots',          label: 'Bots'           },
  { to: '/documents',     label: 'Documentos'     },
  { to: '/dashboard',     label: 'Dashboard'      },
];

const LANDING_LINKS = [
  { label: 'Cómo funciona', id: 'como-funciona' },
  { label: 'Canales',       id: 'canales'        },
  { label: 'Precios',       id: 'costo'          },
  { label: 'Contacto',      id: 'contacto'       },
];

export const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [appBaseUrl,     setAppBaseUrl]     = useState(window.location.origin);
  const [llmModel,       setLlmModel]       = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);
  const [userMenuOpen,   setUserMenuOpen]   = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled,       setScrolled]       = useState(false);
  const [activeSection,  setActiveSection]  = useState('');

  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    publicService.getPublicUrl().then(setAppBaseUrl).catch(() => {});
    publicService.getLlmInfo().then((info) => setLlmModel(info.model)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) return;
    const handleScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.5);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isAuthenticated]);

  // IntersectionObserver para sección activa
  useEffect(() => {
    if (isAuthenticated) return;
    const ids = LANDING_LINKS.map(l => l.id);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { threshold: 0.3, rootMargin: '-64px 0px 0px 0px' }
    );
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [isAuthenticated]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cerrar menú mobile al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const publicPageUrl = user?.username ? `${appBaseUrl}/u/${user.username}` : null;

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!publicPageUrl) return;
    navigator.clipboard.writeText(publicPageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLandingNav = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Si no estamos en la landing, navegar y luego scrollear
      navigate(`/#${id}`);
    }
    setMobileMenuOpen(false);
  }, [navigate]);

  const navStyle = isAuthenticated
    ? { backgroundColor: 'white' }
    : {
        backgroundColor: scrolled ? 'rgba(42, 59, 77, 0.95)' : 'transparent',
        backdropFilter:         scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter:   scrolled ? 'blur(12px)' : 'none',
      };

  return (
    <nav
      className={`${isAuthenticated ? 'sticky shadow-sm border-b border-gray-200' : 'fixed'} top-0 left-0 right-0 z-50 transition-all duration-300`}
      style={navStyle}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* ── Izquierda: logo + links ── */}
          <div className="flex items-center gap-8">
            <Link to={isAuthenticated ? '/clients' : '/'}>
              <span
                className="font-editorial text-[24px] font-light uppercase tracking-[0.08em] select-none"
                style={{ color: isAuthenticated ? '#0D1B38' : 'white' }}
              >
                GESTIONA
              </span>
            </Link>

            {isAuthenticated && (
              <div className="hidden md:flex items-center gap-1">
                {NAV_LINKS.map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(to)
                        ? 'text-primary bg-primary-50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                    {isActive(to) && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── Derecha ── */}
          <div className="flex items-center gap-2">

            {/* Landing nav — no autenticado */}
            {!isAuthenticated && (
              <div className="hidden md:flex items-center gap-8">
                {LANDING_LINKS.map(({ label, id }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    onClick={(e) => handleLandingNav(e, id)}
                    className="text-nav relative py-1 transition-colors duration-200"
                    style={{ color: activeSection === id ? 'white' : 'rgba(255,255,255,0.65)' }}
                  >
                    {label}
                    <span
                      className="absolute bottom-0 left-0 h-[2px] transition-all duration-200 ease-out"
                      style={{
                        width: activeSection === id ? '100%' : '0%',
                        backgroundColor: '#C5A55A',
                      }}
                    />
                  </a>
                ))}
                <Link
                  to="/login"
                  className="text-cta px-5 py-2.5 rounded-lg transition-colors border"
                  style={{ color: 'white', borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  Iniciar sesión
                </Link>
              </div>
            )}

            {/* Menú de usuario — autenticado */}
            {isAuthenticated && (
              <>
                {/* Dropdown */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(v => !v)}
                    className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-primary text-sm font-semibold">
                        {user?.username?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                      {user?.username}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg ring-1 ring-black/5 overflow-hidden z-50">

                      <div className="flex items-center gap-3 px-4 py-3.5 bg-gray-50 border-b border-gray-100">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-primary font-semibold">
                            {user?.username?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{user?.username}</p>
                          {user?.email && (
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                          )}
                        </div>
                      </div>

                      <div className="py-1">
                        <Link
                          to="/settings"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Ajustes
                        </Link>

                        {publicPageUrl && (
                          <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors group">
                            <a
                              href={publicPageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 text-sm text-gray-700 flex-1 min-w-0"
                            >
                              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span className="truncate">Mi página pública</span>
                            </a>
                            <button
                              onClick={handleCopyUrl}
                              title="Copiar URL"
                              className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
                            >
                              {copied
                                ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              }
                            </button>
                          </div>
                        )}
                      </div>

                      {llmModel && (
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-400">Modelo</p>
                            <p className="text-xs font-medium text-gray-700 truncate" title={llmModel}>{llmModel}</p>
                          </div>
                        </div>
                      )}

                      <div className="border-t border-gray-100">
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Cerrar sesión
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Hamburger — solo mobile */}
                <button
                  onClick={() => setMobileMenuOpen(v => !v)}
                  className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                  aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                >
                  {mobileMenuOpen
                    ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Menú mobile ── */}
      {isAuthenticated && mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white shadow-md">
          <div className="px-3 py-2 space-y-0.5">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(to)
                    ? 'text-primary bg-primary-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};
