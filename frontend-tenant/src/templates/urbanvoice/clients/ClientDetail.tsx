import { Link, Navigate } from 'react-router-dom';
import { useDemoDb } from '../demo/store';
import { badgeMeta, club, health, healthMeta, plan, siteUrl, state } from '../demo/selectors';
import { MES, initials, pd } from '../demo/format';

interface ClientDetailProps {
  clientId: string;
}

/** Ficha del cliente. En esta tarea sólo la cabecera (las tabs llegan después). */
export default function ClientDetail({ clientId }: ClientDetailProps) {
  const db = useDemoDb();
  const c = club(db, clientId);
  if (!c) return <Navigate to="/clients" replace />;
  const S = state(db, c);
  const p = plan(db, c.plan);
  const H = health(db, c);
  const created = pd(c.created);
  const createdLabel = created ? `${MES[created.getMonth()]} ${created.getFullYear()}` : '—';

  return (
    <>
      <Link className="back" to="/clients">
        <svg className="i"><use href="#o-left" /></svg>Clientes
      </Link>
      <div className="ch-h card">
        <div className="ch-id">
          <span className="clogo" style={{ width: 64, height: 64, background: c.color, fontSize: 24 }}>
            {initials(c.name)}
          </span>
          <div>
            <h1>{c.name}</h1>
            <p className="muted">
              {c.tipo || 'Cliente'} · {c.city}, {c.prov} · {c.socios.toLocaleString('es-AR')} vecinos · cliente desde {createdLabel}
            </p>
            <div className="ch-b">
              <span className={`bdg ${badgeMeta(S.k).tone}`}>{badgeMeta(S.k).label}</span>
              <span className={`pl pl-${p.id}`}>Plan {p.name}</span>
              {H.k !== 'off' ? <span className={`bdg ${healthMeta(H.k).tone}`}>{healthMeta(H.k).label}</span> : null}
              <span className="url"><svg className="i"><use href="#o-ext" /></svg>{siteUrl(db, c)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
