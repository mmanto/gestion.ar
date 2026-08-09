import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getNavLinks } from '../../config/navLinks';
import { useSidebar } from '../../hooks/useSidebar';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { resolveAssetUrl } from '../../utils/assetUrl';

export const KeroSidebar: React.FC = () => {
  const location = useLocation();
  const { collapsed, toggleCollapsed } = useSidebar();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const tenantName = tenant?.name || 'Backoffice';
  const logoH = resolveAssetUrl(tenant?.branding.logo_url_horizontal || tenant?.branding.logo_url);
  const logoV = resolveAssetUrl(tenant?.branding.logo_url_vertical || tenant?.branding.logo_url);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const visibleLinks = getNavLinks(tenant?.branding.industry).filter(
    (item) => item.type === 'separator' || !item.roles || (user && item.roles.includes(user.role))
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
    /* Sidebar flotante — desktop. En mobile la navegación vive en el menú del
       avatar (KeroTopbar/UserMenu), no hay drawer de aplicación. */
    <aside
      className={`hidden md:flex md:flex-col fixed left-6 top-6 bottom-6 rounded-[1.4rem] bg-[#F8F9FD] z-40 overflow-hidden transition-all duration-300 ${
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
  );
};
