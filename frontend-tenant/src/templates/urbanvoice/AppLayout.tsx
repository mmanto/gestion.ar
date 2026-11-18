import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import partnerTenantsService from '../../services/partnerTenants.service';
import type { PartnerTenant } from '../../types/partnerTenant.types';
import { clientMatches, isClientOf, statusMeta, tenantColor, tenantInitials } from './clients/tenantDisplay';
import { useUvPermissions } from './permissions';
import { UvIcon } from './ui/UvIcon';
import { UvSprite } from './ui/UvSprite';
import { ToastProvider } from './ui/Toast';
import './fonts.css';
import './panel.css';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  operativo: 'Operativo',
  partner: 'Administrador general',
};

function clientLogo(client: PartnerTenant, size: number) {
  return (
    <span className="clogo" style={{ width: size, height: size, background: tenantColor(client), fontSize: Math.round(size * 0.38) }}>
      {tenantInitials(client.name)}
    </span>
  );
}

/** Shell de la administración de UrbanVoice (demo `administracion/index.html`). */
export function UrbanVoiceAppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const perms = useUvPermissions();

  const [mini, setMini] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [q, setQ] = useState('');
  const [clients, setClients] = useState<PartnerTenant[]>([]);
  const root = useRef<HTMLDivElement>(null);

  // Los clientes del panel son los tenant hijos del tenant servido (ADR-046):
  // el contador y el buscador de la topbar salen de acá, no de datos demo.
  useEffect(() => {
    if (!tenant?.tenant_id) return;
    let cancelled = false;
    partnerTenantsService
      .listTenants(1, 100)
      .then((result) => {
        if (!cancelled) setClients(result.tenants.filter((t) => isClientOf(tenant.tenant_id, t)));
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
    // También en cada navegación: dar de alta o suspender un cliente cambia el
    // contador y el buscador sin recargar la página.
  }, [tenant?.tenant_id, pathname]);

  const results = useMemo(() => clients.filter((c) => clientMatches(c, q)).slice(0, 6), [clients, q]);
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || 'Administrador';
  const roleLabel = ROLE_LABEL[user?.role || 'operativo'] || 'Operativo';
  // El partner sólo administra clientes: Partners y Configuración son de los
  // usuarios del tenant base (endpoints /api/tenant/*, que el partner no usa).
  const partnerOnlyClients = perms.isPartner;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNavOpen(false);
      setUserOpen(false);
      setQ('');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) return;
      if (!(e.target as Element).closest('.dd')) {
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const isClientsRoute = pathname === '/clients' || pathname.startsWith('/clients/');
  const isTenantRoute = pathname === '/partners' || pathname.startsWith('/partners/') || pathname === '/settings';
  if (!isClientsRoute && (partnerOnlyClients || !isTenantRoute)) {
    return <Navigate to="/clients" replace />;
  }

  const toggleSide = () => {
    if (window.innerWidth > 900) setMini((v) => !v);
    else setNavOpen((v) => !v);
  };

  const openClient = (client: PartnerTenant) => {
    setQ('');
    navigate(`/clients/${client.tenant_id}`);
  };

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div ref={root} className={`uv-admin${mini ? ' side-mini' : ''}${navOpen ? ' nav-open' : ''}`}>
      <UvSprite />
      <ToastProvider>
        <div className="app">
          <aside className="side" id="side">
            <div className="brand side-brand">
              <div className="uvb">
                <img className="uv-logo" src="/uv/urbanvoice-logo.png" alt="UrbanVoice" />
                <small>Administración de la plataforma</small>
              </div>
            </div>
            <nav id="nav">
              <small className="nav-g">Gestión</small>
              <button
                type="button"
                data-v="clubs"
                aria-label="Clientes"
                className={pathname.startsWith('/clients') ? 'on' : ''}
                onClick={() => navigate('/clients')}
              >
                <UvIcon name="club" />
                <span>Clientes</span>
                <em>{clients.length || ''}</em>
              </button>
              {partnerOnlyClients ? null : (
                <button
                  type="button"
                  data-v="partners"
                  aria-label="Partners"
                  className={pathname.startsWith('/partners') ? 'on' : ''}
                  onClick={() => navigate('/partners')}
                >
                  <UvIcon name="handshake" />
                  <span>Partners</span>
                </button>
              )}
              {partnerOnlyClients ? null : (
                <>
                  <small className="nav-g">Ajustes</small>
                  <button
                    type="button"
                    data-v="config"
                    aria-label="Configuración"
                    className={pathname === '/settings' ? 'on' : ''}
                    onClick={() => navigate('/settings')}
                  >
                    <UvIcon name="gear" />
                    <span>Configuración</span>
                  </button>
                </>
              )}
            </nav>
            <div className="side-art" aria-hidden="true">
              <svg viewBox="0 0 260 200" preserveAspectRatio="none">
                <g fill="none" stroke="#087CF5" strokeWidth="1">
                  <path d="M-10 140 C 60 60, 140 200, 270 70" opacity=".55" />
                  <path d="M-10 150 C 60 72, 140 206, 270 82" opacity=".5" />
                  <path d="M-10 160 C 60 84, 140 212, 270 94" opacity=".45" />
                  <path d="M-10 170 C 60 96, 140 218, 270 106" opacity=".4" />
                  <path d="M-10 180 C 60 108, 140 224, 270 118" opacity=".35" />
                  <path d="M-10 190 C 60 120, 140 230, 270 130" opacity=".3" />
                  <path d="M-10 200 C 60 132, 140 236, 270 142" opacity=".25" />
                  <path d="M-10 128 C 60 48, 140 194, 270 58" opacity=".4" />
                  <path d="M-10 116 C 60 36, 140 188, 270 46" opacity=".3" />
                </g>
              </svg>
              <b>Más clientes.<br />Más comunidad.</b>
              <i />
            </div>
          </aside>
          <div className="scrim" onClick={() => setNavOpen(false)} />
          <main className="main">
            <header className="top">
              <button type="button" className="ico burger" id="burger" aria-label="Menú" onClick={toggleSide}>
                <UvIcon name="menu" />
              </button>
              <div className="srch">
                <UvIcon name="search" />
                <input
                  id="q"
                  placeholder="Buscar cliente, dominio o nombre interno…"
                  autoComplete="off"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && results[0]) openClient(results[0]);
                    if (e.key === 'Escape') setQ('');
                  }}
                />
                {q.trim() ? (
                  <div className="srch-r">
                    {results.length ? (
                      results.map((client) => {
                        const meta = statusMeta(client.status);
                        return (
                          <a
                            href={`/clients/${client.tenant_id}`}
                            key={client.tenant_id}
                            onClick={(e) => {
                              e.preventDefault();
                              openClient(client);
                            }}
                          >
                            {clientLogo(client, 30)}
                            <span>
                              <b>{client.name}</b>
                              <small>{client.domain || (client.slug ? `intellify.pro/${client.slug}` : '—')}</small>
                            </span>
                            <span className={`bdg ${meta.tone}`}>{meta.label}</span>
                          </a>
                        );
                      })
                    ) : (
                      <p className="muted">Sin resultados</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="top-r">
                <div className="dd">
                  <button
                    type="button"
                    className="user"
                    onClick={() => setUserOpen((v) => !v)}
                  >
                    <span className="av">{tenantInitials(fullName)}</span>
                    <span className="u-t">
                      <b>{fullName}</b>
                      <small>{roleLabel}</small>
                    </span>
                    <UvIcon name="chev" />
                  </button>
                  <div className="dd-m user-m" hidden={!userOpen}>
                    {perms.isAdmin ? (
                      <button type="button" onClick={() => navigate('/settings')}>
                        <UvIcon name="gear" />
                        Configuración
                      </button>
                    ) : null}
                    <button type="button" onClick={doLogout}>
                      <UvIcon name="out" />
                      Salir
                    </button>
                  </div>
                </div>
              </div>
            </header>
            <div className="view" id="view">
              {children}
            </div>
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
