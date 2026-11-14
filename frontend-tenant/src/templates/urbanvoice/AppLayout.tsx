import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDemoDb } from './demo/store';
import { badgeMeta, counts, pendingAll, searchClubs, state } from './demo/selectors';
import { initials } from './demo/format';
import type { Club } from './demo/types';
import { useUvPermissions } from './permissions';
import { UvIcon } from './ui/UvIcon';
import { UvSprite } from './ui/UvSprite';
import { ToastProvider } from './ui/Toast';
import './fonts.css';
import './panel.css';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', operativo: 'Operativo' };

function clubLogo(c: Club, size: number) {
  return (
    <span className="clogo" style={{ width: size, height: size, background: c.color, fontSize: Math.round(size * 0.38) }}>
      {initials(c.name)}
    </span>
  );
}

/** Shell de la administración de UrbanVoice (demo `administracion/index.html`). */
export function UrbanVoiceAppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const perms = useUvPermissions();
  const db = useDemoDb();

  const [mini, setMini] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement>(null);

  const activeCount = counts(db).all - counts(db).baja;
  const pending = useMemo(() => pendingAll(db), [db]);
  const results = useMemo(() => searchClubs(db, q), [db, q]);
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || 'Administrador';
  const roleLabel = ROLE_LABEL[user?.role || 'operativo'] || 'Operativo';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNavOpen(false);
      setBellOpen(false);
      setUserOpen(false);
      setQ('');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) return;
      if (!(e.target as Element).closest('.dd')) {
        setBellOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!(pathname === '/clients' || pathname.startsWith('/clients/') || pathname === '/settings')) {
    return <Navigate to="/clients" replace />;
  }

  const toggleSide = () => {
    if (window.innerWidth > 900) setMini((v) => !v);
    else setNavOpen((v) => !v);
  };

  const openClient = (c: Club) => {
    setQ('');
    setBellOpen(false);
    navigate(`/clients/${c.id}`);
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
              <button
                type="button"
                data-v="clubs"
                aria-label="Clientes"
                className={pathname.startsWith('/clients') ? 'on' : ''}
                onClick={() => navigate('/clients')}
              >
                <UvIcon name="club" />
                <span>Clientes</span>
                <em>{activeCount}</em>
              </button>
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
                  placeholder="Buscar cliente, localidad o responsable…"
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
                      results.map((c) => {
                        const meta = badgeMeta(state(db, c).k);
                        return (
                          <a
                            href={`/clients/${c.id}`}
                            key={c.id}
                            onClick={(e) => {
                              e.preventDefault();
                              openClient(c);
                            }}
                          >
                            {clubLogo(c, 30)}
                            <span>
                              <b>{c.name}</b>
                              <small>{c.city} · {c.owner}</small>
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
                    className="ico bell"
                    aria-label="Avisos"
                    onClick={() => {
                      setBellOpen((v) => !v);
                      setUserOpen(false);
                    }}
                  >
                    <UvIcon name="bell" />
                    <em>{pending.length || ''}</em>
                  </button>
                  <div className="dd-m bell-m" hidden={!bellOpen}>
                    <div className="dd-h">
                      <b>Para hacer</b>
                      <span>{pending.length}</span>
                    </div>
                    {pending.length ? (
                      pending.slice(0, 7).map((p, i) => (
                        <a
                          href={`/clients/${p.clubId}`}
                          key={`${p.clubId}-${i}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/clients/${p.clubId}`);
                          }}
                        >
                          <span className={`dot ${p.tone}`} />
                          <span>
                            <b>{db.clubs.find((c) => c.id === p.clubId)?.name}</b>
                            <small>{p.text}</small>
                          </span>
                        </a>
                      ))
                    ) : (
                      <p className="muted">No hay nada pendiente.</p>
                    )}
                  </div>
                </div>
                <div className="dd">
                  <button
                    type="button"
                    className="user"
                    onClick={() => {
                      setUserOpen((v) => !v);
                      setBellOpen(false);
                    }}
                  >
                    <span className="av">{initials(fullName)}</span>
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
