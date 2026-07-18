import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../hooks/useSidebar';
import { useTenant } from '../../hooks/useTenant';
import { NAV_LINKS } from '../../config/navLinks';

export const Sidebar: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { tenant } = useTenant();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const tenantName = tenant?.name || 'Backoffice';
  const logoH = tenant?.branding.logo_url_horizontal || tenant?.branding.logo_url;
  const logoV = tenant?.branding.logo_url_vertical;
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  const visibleLinks = NAV_LINKS.filter(
    (item) => item.type === 'separator' || !item.roles || (user && item.roles.includes(user.role))
  );

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
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
          <Link to="/dashboard" className="flex items-center gap-2">
            {/* Logo horizontal — visible solo expandido */}
            {!collapsed && logoH ? (
              <img src={logoH} alt={tenantName} className="h-8 max-w-[120px] object-contain" />
            ) : null}
            {/* Logo vertical — visible solo colapsado */}
            {collapsed && logoV ? (
              <img src={logoV} alt={tenantName} className="h-8 w-8 object-contain" />
            ) : null}
            {/* Fallback textual — solo si no hay logo para el estado actual */}
            {(!collapsed && !logoH) || (collapsed && !logoV) ? (
              <span
                className="font-editorial text-2xl font-semibold uppercase tracking-[0.08em] select-none"
                style={{ color: 'white' }}
              >
                {collapsed ? (
                  <span className="hidden md:inline">{tenantName.charAt(0).toUpperCase()}</span>
                ) : null}
                <span className={collapsed ? 'md:hidden' : ''}>{tenantName}</span>
              </span>
            ) : null}
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
