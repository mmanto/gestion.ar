import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { mutate, useDemoDb } from '../demo/store';
import {
  LS, badgeMeta, clubPrice, leadsOfPartner, liqOf, mKey, mLabel, pActive, pClubs, pClients, pColl, pComm, pDebt,
  pMrr, pMonths, pPaid, partner, state,
} from '../demo/selectors';
import { TODAY, addM, fD, fDs, initials, money, nS, relTs, waLink } from '../demo/format';
import { actorOf, setPartnerActive } from '../demo/actions';
import { useUvPermissions } from '../permissions';
import { UvIcon } from '../ui/UvIcon';
import { useToast } from '../ui/Toast';
import { ConfirmModal } from '../clients/modals/ConfirmModal';
import { PartnerLogo } from './PartnerLogo';
import { PartnerModal } from './modals/PartnerModal';
import { SettlementModal } from './modals/SettlementModal';
import { SettlementDetailModal } from './modals/SettlementDetailModal';

type PartnerTab = 'cartera' | 'comisiones' | 'solicitudes' | 'equipo';

interface PartnerDetailProps {
  partnerId: string;
}

export default function PartnerDetail({ partnerId }: PartnerDetailProps) {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PartnerTab>('cartera');
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [settleYm, setSettleYm] = useState<string | null>(null);
  const [detailYm, setDetailYm] = useState<string | null>(null);

  const p = partner(db, partnerId);
  if (!p) return <Navigate to="/partners" replace />;

  const prev = mKey(addM(TODAY, -1));
  const clubs = pClubs(db, p.id);
  const leads = leadsOfPartner(db, p.id);
  const tabs: Array<{ key: PartnerTab; label: string; count?: number | string }> = [
    { key: 'cartera', label: 'Cartera', count: clubs.length },
    { key: 'comisiones', label: 'Comisiones', count: pDebt(db, p.id) ? '•' : '' },
    { key: 'solicitudes', label: 'Solicitudes', count: leads.filter((l) => l.status === 'nueva').length || '' },
    { key: 'equipo', label: 'Equipo y datos', count: '' },
  ];
  const visibleTab = tabs.some((t) => t.key === tab) ? tab : 'cartera';

  const openClub = (clubId: string) => navigate(`/clients/${clubId}`);
  const onRowKey = (e: KeyboardEvent, clubId: string) => {
    if (e.key === 'Enter') openClub(clubId);
  };

  const reactivate = () => {
    mutate((draft) => setPartnerActive(draft, p.id, true, actorOf(user)));
    showToast('Partner reactivado');
  };
  const suspend = () => {
    mutate((draft) => setPartnerActive(draft, p.id, false, actorOf(user)));
    setSuspendOpen(false);
    showToast('Partner suspendido');
  };

  return (
    <>
      <Link className="back" to="/partners"><UvIcon name="left" />Partners</Link>
      <div className="ch-h card">
        <div className="ch-id">
          <PartnerLogo p={p} size={64} />
          <div>
            <h1>{p.name}</h1>
            <p className="muted">
              {p.owner} · {p.city}, {p.prov} · {p.house ? 'partner interno' : `comisión ${p.pct}%`}
              {p.active === false ? <> · <b>suspendido</b></> : null}
            </p>
          </div>
        </div>
        {p.house ? null : (
          <div className="ch-a">
            {perms.plan ? (
              <button type="button" className="btn" onClick={() => (p.active === false ? reactivate() : setSuspendOpen(true))}>
                <UvIcon name={p.active === false ? 'play' : 'pause'} />
                {p.active === false ? 'Reactivar' : 'Suspender'}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="kpis">
        <div className="kpi info">
          <b>{pActive(db, p.id)}</b>
          <span>Clientes activos</span>
          <small>{pClients(db, p.id)} clientes</small>
        </div>
        <div className="kpi ok">
          <b>{money(pMrr(db, p.id))}</b>
          <span>Abonos por mes</span>
          <small>de su cartera</small>
        </div>
        <div className="kpi">
          <b>{money(pComm(db, p.id, prev))}</b>
          <span>Comisión de {mLabel(prev).split(' ')[0].toLowerCase()}</span>
          <small>{p.house ? 'sin comisión' : liqOf(db, p.id, prev) ? 'liquidada' : 'por liquidar'}</small>
        </div>
        <div className={`kpi${pDebt(db, p.id) ? ' warn' : ''}`}>
          <b>{money(pDebt(db, p.id))}</b>
          <span>Por liquidar</span>
          <small>{money(pPaid(db, p.id))} ya pagados</small>
        </div>
      </div>

      <div className="tabs ctabs">
        {tabs.map((t) => (
          <button type="button" key={t.key} className={visibleTab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count ? <em className="hot">{t.count}</em> : null}
          </button>
        ))}
      </div>

      <div className="ctab-b">
        {visibleTab === 'cartera' ? (
          <div className="card tbl-w">
            <table className="tbl pts">
              <thead>
                <tr><th>Cliente</th><th>Estado</th><th>Abono</th><th>Comisión</th><th>Alta</th><th /></tr>
              </thead>
              <tbody>
                {clubs.map((c) => (
                  <tr key={c.id} tabIndex={0} role="link" onClick={() => openClub(c.id)} onKeyDown={(e) => onRowKey(e, c.id)}>
                    <td data-l="Cliente">
                      <div className="cn">
                        <span className="clogo" style={{ width: 40, height: 40, background: c.color, fontSize: 15 }}>{initials(c.name)}</span>
                        <div>
                          <b>{c.name}</b>
                          <em className="tag">Cliente</em>
                          <small>{c.city}, {c.prov} · {nS(c.socios)}</small>
                        </div>
                      </div>
                    </td>
                    <td data-l="Estado">
                      <span className={`bdg ${badgeMeta(state(db, c).k).tone}`}>{badgeMeta(state(db, c).k).label}</span>
                    </td>
                    <td data-l="Abono"><b>{money(clubPrice(db, c))}</b><small>por mes</small></td>
                    <td data-l="Comisión">
                      {p.house ? '—' : <><b>{money(Math.round((clubPrice(db, c) * p.pct) / 100))}</b><small>por mes</small></>}
                    </td>
                    <td data-l="Alta"><small>{fDs(c.created)}</small></td>
                    <td className="ra"><span className="go"><UvIcon name="right" /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clubs.length ? null : (
              <div className="empty">
                <UvIcon name="club" />
                <b>Todavía no tiene clientes</b>
                <span>Los clientes aparecen acá cuando el partner los da de alta desde su panel.</span>
              </div>
            )}
          </div>
        ) : null}

        {visibleTab === 'comisiones' ? (
          p.house ? (
            <div className="card">
              <div className="empty">
                <UvIcon name="cash" />
                <b>El partner interno no cobra comisión</b>
                <span>Sus ventas son de UrbanVoice.</span>
              </div>
            </div>
          ) : (
            <div className="card tbl-w">
              <table className="tbl pts">
                <thead>
                  <tr><th>Mes</th><th>Cobrado a sus clientes</th><th>Comisión ({p.pct}%)</th><th>Estado</th><th /></tr>
                </thead>
                <tbody>
                  {pMonths(7).map((m) => {
                    const collected = pColl(db, p.id, m.k);
                    const amount = pComm(db, p.id, m.k);
                    const q = liqOf(db, p.id, m.k);
                    return (
                      <tr key={m.k}>
                        <td data-l="Mes"><b>{m.label}</b></td>
                        <td data-l="Cobrado">{money(collected)}</td>
                        <td data-l="Comisión"><b>{money(amount)}</b></td>
                        <td data-l="Estado">
                          {m.cur
                            ? <span className="bdg info">En curso</span>
                            : !amount
                              ? <span className="bdg off">Sin cobros</span>
                              : q
                                ? <><span className="bdg ok">Liquidada</span><small>{fDs(q.at)} · {q.method}</small></>
                                : <span className="bdg warn">Por liquidar</span>}
                        </td>
                        <td className="ra">
                          {!m.cur && amount && !q && perms.pay ? (
                            <button type="button" className="btn sm pri" onClick={() => setSettleYm(m.k)}>Liquidar</button>
                          ) : amount ? (
                            <button type="button" className="btn sm ghost" onClick={() => setDetailYm(m.k)}>Detalle</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted sm" style={{ padding: '12px 16px' }}>Se calcula sobre lo que pagaron en el mes los clientes del partner. Un mes se liquida cuando termina.</p>
            </div>
          )
        ) : null}

        {visibleTab === 'solicitudes' ? (
          <div className="card">
            {leads.length ? (
              <div className="todo">
                {leads.slice().sort((a, b) => b.at - a.at).map((l) => (
                  <div className="td" key={l.id}>
                    <span className={`dot ${LS[l.status][1]}`} />
                    <div className="td-t">
                      <b>{l.club}</b>
                      <small>{l.city} · {l.owner} · {relTs(l.at)}</small>
                    </div>
                    <div className="td-a"><span className={`bdg ${LS[l.status][1]}`}>{LS[l.status][0]}</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <UvIcon name="inbox" />
                <b>No tiene solicitudes</b>
                <span>Llegan por su link con código o cuando las asignás desde Solicitudes de demo.</span>
              </div>
            )}
          </div>
        ) : null}

        {visibleTab === 'equipo' ? (
          <div className="g2">
            <section className="card">
              <div className="ch">
                <h3 className="ct"><span className="cti"><UvIcon name="team" /></span>Datos</h3>
                {perms.edit ? (
                  <button type="button" className="btn sm ghost" onClick={() => setEditOpen(true)}>
                    <UvIcon name="edit" />Editar
                  </button>
                ) : null}
              </div>
              <dl className="dl">
                <dt>Responsable</dt><dd>{p.owner}</dd>
                <dt>WhatsApp</dt>
                <dd>
                  <a href={waLink(p.phone, `Hola ${p.owner.split(' ')[0]}! Te escribimos de UrbanVoice.`)} target="_blank" rel="noopener noreferrer">
                    {p.phone}
                  </a>
                </dd>
                <dt>Email</dt><dd>{p.email}</dd>
                <dt>Ciudad</dt><dd>{p.city}, {p.prov}</dd>
                <dt>Comisión</dt><dd>{p.house ? 'Sin comisión' : `${p.pct}% de lo que cobran sus clientes`}</dd>
                <dt>Link de ventas</dt><dd>{`${db.cfg.domain}/?p=${p.code}`}</dd>
                <dt>Partner desde</dt><dd>{fD(p.since)}</dd>
              </dl>
              {p.notes ? <p className="muted sm" style={{ marginTop: 10 }}>{p.notes}</p> : null}
            </section>
            <section className="card">
              <div className="ch">
                <h3 className="ct"><span className="cti"><UvIcon name="key" /></span>Usuarios del panel</h3>
              </div>
              <div className="todo">
                {p.users.map((u) => (
                  <div className="td" key={u.id}>
                    <span className="av xs">{initials(u.name)}</span>
                    <div className="td-t">
                      <b>{u.name}</b>
                      <small>
                        {u.email} · {u.role === 'admin' ? 'Administrador' : 'Vendedor'}
                        {u.last ? ` · último ingreso ${relTs(u.last)}` : ''}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <PartnerModal open={editOpen} partnerId={p.id} onClose={() => setEditOpen(false)} />
      <SettlementModal open={!!settleYm} partnerId={p.id} ym={settleYm} onClose={() => setSettleYm(null)} />
      <SettlementDetailModal open={!!detailYm} partnerId={p.id} ym={detailYm} onClose={() => setDetailYm(null)} />
      <ConfirmModal
        open={suspendOpen}
        title={`Suspender a ${p.name}`}
        description="No va a poder entrar a su panel ni dar de alta clientes. Los clientes que ya tiene siguen funcionando y sus comisiones se mantienen."
        confirmLabel="Suspender"
        danger
        onConfirm={suspend}
        onClose={() => setSuspendOpen(false)}
      />
    </>
  );
}
