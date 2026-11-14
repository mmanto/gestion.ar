import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useDemoDb } from '../demo/store';
import { badgeMeta, club, health, healthMeta, plan, setupPct, siteUrl, state } from '../demo/selectors';
import { MES, addD, fD, initials, pd, rel } from '../demo/format';
import { useUvPermissions } from '../permissions';
import { UvIcon } from '../ui/UvIcon';
import { TooltipHost } from '../ui/Tooltip';
import SummaryTab from './tabs/SummaryTab';
import BillingTab from './tabs/BillingTab';
import UsageTab from './tabs/UsageTab';
import HistoryTab from './tabs/HistoryTab';

export type DetailTab = 'resumen' | 'abono' | 'uso' | 'historial';

interface ClientDetailProps {
  clientId: string;
}

export default function ClientDetail({ clientId }: ClientDetailProps) {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const [tab, setTab] = useState<DetailTab>('resumen');
  const c = club(db, clientId);
  if (!c) return <Navigate to="/clients" replace />;

  const S = state(db, c);
  const p = plan(db, c.plan);
  const H = health(db, c);
  const pct = setupPct(c);
  const created = pd(c.created);
  const createdLabel = created ? `${MES[created.getMonth()]} ${created.getFullYear()}` : '—';

  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: 'resumen', label: 'Resumen' },
    ...(perms.money || perms.pay ? [{ key: 'abono' as DetailTab, label: 'Abono y pagos' }] : []),
    { key: 'uso', label: 'Uso y puesta en marcha' },
    { key: 'historial', label: 'Historial' },
  ];
  const visibleTab = tabs.some((t) => t.key === tab) ? tab : 'resumen';

  const alert: [string, string] | null =
    S.k === 'atrasado'
      ? ['bad', `El abono venció el ${fD(S.due)}. ${db.cfg.autoSusp ? `Si no paga, el ${fD(addD(S.cut!, 1))} se suspende el sitio y el panel del cliente.` : ''}`]
      : S.k === 'suspendido'
        ? ['sus', S.man ? 'Lo suspendiste a mano. El sitio y el panel del cliente están bloqueados.' : `Sin pago desde el ${fD(S.due)}. El sitio muestra «fuera de servicio» y el panel del cliente está bloqueado hasta que pague.`]
        : S.k === 'prueba'
          ? ['info', `Está probando UrbanVoice. La prueba termina el ${fD(S.due)}; para seguir tiene que pagar el primer mes.`]
          : S.k === 'pronto'
            ? ['warn', `El abono vence ${rel(S.due!)}. Podés mandarle un recordatorio.`]
            : S.k === 'baja'
              ? ['off', `Dado de baja el ${fD(c.bajaAt ?? null)}${c.bajaWhy ? ` · ${c.bajaWhy}` : ''}. El sitio y el panel no están disponibles.`]
              : null;

  const glance: Array<{ tab: DetailTab; label: string; value: string; tone: string }> = [
    ...(tabs.some((t) => t.key === 'abono')
      ? [{ tab: 'abono' as DetailTab, label: 'Abono', value: badgeMeta(S.k).label, tone: badgeMeta(S.k).tone }]
      : []),
    { tab: 'uso', label: 'Uso', value: H.k !== 'off' ? healthMeta(H.k).label : '—', tone: H.k !== 'off' ? healthMeta(H.k).tone : 'off' },
    { tab: 'uso', label: 'Puesta en marcha', value: `${pct}%`, tone: pct === 100 ? 'ok' : 'info' },
  ];

  return (
    <>
      <TooltipHost />
      <Link className="back" to="/clients"><UvIcon name="left" />Clientes</Link>
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
              <span className="url"><UvIcon name="ext" />{siteUrl(db, c)}</span>
            </div>
          </div>
        </div>
      </div>

      {alert ? (
        <div className={`alert ${alert[0]}`}>
          <UvIcon name={S.k === 'prueba' || S.k === 'pronto' ? 'clock' : 'alert'} />
          <span>{alert[1]}</span>
        </div>
      ) : null}

      <div className="glance">
        {glance.map((g, i) => (
          <button type="button" className={`gl gl-${g.tone}`} key={`${g.tab}-${i}`} onClick={() => setTab(g.tab)}>
            <small>{g.label}</small>
            <b>{g.value}</b>
          </button>
        ))}
      </div>

      <div className="tabs ctabs">
        {tabs.map((t) => (
          <button type="button" key={t.key} className={visibleTab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ctab-b">
        {visibleTab === 'resumen' ? <SummaryTab clubId={c.id} /> : null}
        {visibleTab === 'abono' ? <BillingTab clubId={c.id} /> : null}
        {visibleTab === 'uso' ? <UsageTab clubId={c.id} /> : null}
        {visibleTab === 'historial' ? <HistoryTab clubId={c.id} /> : null}
      </div>
    </>
  );
}
