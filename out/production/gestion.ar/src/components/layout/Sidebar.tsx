import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../hooks/useSidebar';
import { useTenant } from '../../hooks/useTenant';
import { NAV_LINKS } from '../../config/navLinks';

export const Sidebar: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { tenant } = useTenant();
  const tenantName = tenant?.name || 'Backoffice';
  const { collapsed, toggleCollapsed } = useSidebar();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  const visibleLinks = NAV_LINKS.filter(
    (item) => item.type === 'separator' || !item.roles || (user && item.roles.includes(user.role))
  );

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
      {/* Botón hamburguesa — mobile */}
      <button
        onClick={() => setMobileOpen(v => !v)}
        className="md:hidden fixed top-3 left-3 z-[60] p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
        style={{ backgroundColor: '#2A3B4D' }}
        aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        {mobileOpen
          ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        }
      </button>

      {/* Overlay — mobile */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 z-50 flex flex-col transition-all duration-300 md:translate-x-0 ${
          collapsed ? 'md:w-16' : 'md:w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ backgroundColor: '#2A3B4D' }}
      >
        <div
          className={`flex items-center justify-center gap-2 h-16 flex-shrink-0 transition-all duration-300 px-5 ${
            collapsed ? 'md:px-2' : ''
          }`}
        >
          <Link to="/dashboard">
            <span
              className="font-editorial text-2xl font-semibold uppercase tracking-[0.08em] select-none"
              style={{ color: 'white' }}
            >
              {collapsed ? <span className="hidden md:inline">{tenantName.charAt(0).toUpperCase()}</span> : null}
              <span className={collapsed ? 'md:hidden' : ''}>{tenantName}</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleLinks.map((item, idx) =>
            item.type === 'separator' ? (
              <div key={`sep-${idx}`} className="my-2 border-t border-white/10" />
            ) : (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? 'md:justify-center md:px-0' : ''
                } ${
                  isActive(item.to)
                    ? 'text-white bg-white/15'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {item.icon}
                </svg>
                <span className={collapsed ? 'md:hidden' : ''}>{item.label}</span>
              </Link>
            )
          )}
        </nav>

        <div className="hidden md:block border-t border-white/10 flex-shrink-0 px-3 py-2">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors px-3 py-2.5 ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <svg
              className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className={collapsed ? 'md:hidden' : ''}>Colapsar</span>
          </button>
        </div>
      </aside>
    </>
  );
};
