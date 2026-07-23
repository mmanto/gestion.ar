import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { NAV_LINKS } from '../../config/navLinks';
import { useSidebar } from '../../hooks/useSidebar';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { resolveAssetUrl } from '../../utils/assetUrl';

export const KeroSidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggleCollapsed } = useSidebar();
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const tenantName = tenant?.name || 'Backoffice';
  const logoH = resolveAssetUrl(tenant?.branding.logo_url_horizontal || tenant?.branding.logo_url);
  const logoV = resolveAssetUrl(tenant?.branding.logo_url_vertical || tenant?.branding.logo_url);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const visibleLinks = NAV_LINKS.filter(
    (item) => item.type === 'separator' || !item.roles || (user && item.roles.includes(user.role))
  );

  const navItems = (
    <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
      {visibleLinks.map((item, idx) =>
        item.type === 'separator' ? (
          <div key={`sep-${idx}`} className="my-2 border-t border-gray-200" />
        ) : (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center gap-3 h-[2.2rem] px-4 rounded-full text-sm font-medium transition-colors ${
              isActive(item.to)
                ? 'text-blue-600 bg-blue-600/10'
                : 'text-gray-900 hover:text-blue-600 hover:bg-blue-600/5'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {item.icon}
            </svg>
            {item.label}
          </Link>
        )
      )}
    </nav>
  );

  const desktopNavItems = (
    <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
      {visibleLinks.map((item, idx) =>
        item.type === 'separator' ? (
          <div key={`sep-${idx}`} className={collapsed ? 'my-2 mx-2 border-t border-gray-200' : 'my-2 border-t border-gray-200'} />
        ) : (
          <Link
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            className={`flex items-center rounded-full text-sm font-medium transition-colors ${
              collapsed ? 'justify-center w-11 h-11 mx-auto' : 'gap-3 h-[2.2rem] px-4'
            } ${
              isActive(item.to)
                ? 'text-blue-600 bg-blue-600/10'
                : 'text-gray-900 hover:text-blue-600 hover:bg-blue-600/5'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {item.icon}
            </svg>
            {!collapsed && item.label}
          </Link>
        )
      )}
    </nav>
  );

  return (
    <>
      {/* Botón hamburguesa — mobile */}
      <button
        onClick={() => setMobileOpen(v => !v)}
        className="md:hidden fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-[calc(0.75rem+env(safe-area-inset-right))] z-[60] p-2 rounded-lg bg-white text-gray-900 shadow-md hover:bg-gray-50 transition-colors"
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

      {/* Sidebar flotante — desktop */}
      <aside
        className={`hidden md:flex md:flex-col fixed left-6 top-6 bottom-6 rounded-[1.4rem] bg-[#F1F5F9] z-40 overflow-hidden transition-all duration-300 ${
          collapsed ? 'w-[88px]' : 'w-[280px]'
        }`}
      >
        <div
          className={`flex items-center justify-center gap-2 h-20 border-b border-gray-200 flex-shrink-0 transition-all duration-300 ${
            collapsed ? 'px-2' : 'px-5'
          }`}
        >
          <Link to="/dashboard" className="flex items-center gap-2">
            {!collapsed && logoH ? (
              <img src={logoH} alt={tenantName} className="h-16 max-w-[360px] object-contain" />
            ) : collapsed && logoV ? (
              <img src={logoV} alt={tenantName} className="h-16 w-16 object-contain" />
            ) : (
              <span className="font-editorial text-2xl font-semibold uppercase tracking-[0.08em] text-gray-800 select-none">
                {collapsed ? tenantName.charAt(0).toUpperCase() : tenantName}
              </span>
            )}
          </Link>
        </div>
        {desktopNavItems}
        <div className="border-t border-gray-200 flex-shrink-0 px-4 py-3">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className={`w-full flex items-center gap-3 rounded-full text-sm font-medium text-gray-900 hover:text-blue-600 hover:bg-blue-600/5 transition-colors ${
              collapsed ? 'justify-center w-11 h-11 mx-auto' : 'h-[2.2rem] px-4'
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
            {!collapsed && 'Colapsar'}
          </button>
        </div>
      </aside>

      {/* Drawer — mobile */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-screen w-64 z-50 flex flex-col bg-white transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-center gap-2 px-5 h-20 border-b border-gray-200 flex-shrink-0">
          <Link to="/dashboard">
            {logoH ? (
              <img src={logoH} alt={tenantName} className="h-16 max-w-[360px] object-contain" />
            ) : (
              <span className="font-editorial text-2xl font-semibold uppercase tracking-[0.08em] text-gray-800 select-none">
                {tenantName}
              </span>
            )}
          </Link>
        </div>
        {navItems}
        <div className="border-t border-gray-200 flex-shrink-0 px-4 py-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 h-[2.2rem] px-4 rounded-full text-sm font-medium text-gray-900 hover:text-blue-600 hover:bg-blue-600/5 transition-colors"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
};
