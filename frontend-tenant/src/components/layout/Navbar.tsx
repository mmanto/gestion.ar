import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { UserMenu } from './UserMenu';

const LANDING_LINKS = [
  { label: 'Cómo funciona', id: 'como-funciona' },
  { label: 'Canales',       id: 'canales'        },
  { label: 'Precios',       id: 'costo'          },
  { label: 'Contacto',      id: 'contacto'       },
];

interface NavbarProps {
  /** Ruta del "padre" lógico de la pantalla actual. Si se pasa, en mobile
   * se muestra una flecha de volver en vez del botón hamburguesa — patrón
   * de navegación jerárquica típico de apps nativas (ej. conversación -> lista). */
  backTo?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ backTo }) => {
  const { isAuthenticated } = useAuth();
  const { tenant } = useTenant();
  const navigate  = useNavigate();

  const [scrolled,       setScrolled]       = useState(false);
  const [activeSection,  setActiveSection]  = useState('');

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

  const handleLandingNav = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Si no estamos en la landing, navegar y luego scrollear
      navigate(`/#${id}`);
    }
  }, [navigate]);

  const navStyle = isAuthenticated
    ? { backgroundColor: '#4d2a4d' }
    : {
        backgroundColor: scrolled ? 'rgba(74, 42, 77, 0.95)' : 'transparent',
        backdropFilter:         scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter:   scrolled ? 'blur(12px)' : 'none',
      };

  return (
    <nav
      className={`${isAuthenticated ? 'sticky shadow-sm border-b border-white/10' : 'fixed'} top-0 left-0 right-0 z-50 transition-all duration-300`}
      style={navStyle}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* ── Izquierda: logo (solo no autenticado) ── */}
          <div className="flex items-center gap-8">
            {!isAuthenticated && (
              <Link to="/">
                <span
                  className="font-editorial text-2xl font-semibold uppercase tracking-[0.08em] select-none"
                  style={{ color: 'white' }}
                >
                  {tenant?.name || 'Backoffice'}
                </span>
              </Link>
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

            {/* Menú de usuario — autenticado. En mobile es el ÚNICO menú: la
                navegación de la aplicación vive en el menú del avatar (ver
                UserMenu) en vez del drawer lateral. Solo se muestra la flecha
                de volver cuando la pantalla tiene un padre lógico. */}
            {isAuthenticated && (
              <>
                {backTo ? (
                  /* Flecha de volver — pantallas con un padre lógico (ej. conversación -> lista) */
                  <button
                    onClick={() => navigate(backTo)}
                    className="md:hidden p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
                    aria-label="Volver"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  </button>
                ) : null}
                <UserMenu variant="dark" />
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
