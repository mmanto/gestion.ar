import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoDb } from '../demo/store';
import {
  liqOf, mKey, mLabel, pActive, pClients, pColl, pComm, pDebt, pMrr, unassignedLeads,
} from '../demo/selectors';
import { TODAY, addM, fDs, money } from '../demo/format';
import { UvIcon } from '../ui/UvIcon';
import { PartnerLogo } from './PartnerLogo';
import { PartnerModal } from './modals/PartnerModal';

export default function PartnersList() {
  const db = useDemoDb();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);

  const list = db.partners;
  const outside = list.filter((p) => !p.house);
  const activeOutside = outside.filter((p) => p.active !== false).length;
  const mrr = list.reduce((a, p) => a + pMrr(db, p.id), 0);
  const debt = list.reduce((a, p) => a + pDebt(db, p.id), 0);
  const unassigned = unassignedLeads(db);
  const prev = mKey(addM(TODAY, -1));
  const cur = mKey(TODAY);
  const maxColl = Math.max(1, ...list.map((p) => pColl(db, p.id, cur)));

  const open = (id: string) => navigate(`/partners/${id}`);
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter') open(id);
  };

  return (
    <>
      <div className="vh">
        <div>
          <h1>Partners</h1>
          <p className="muted">Quienes venden UrbanVoice y dan de alta a sus clientes desde su propio panel.</p>
        </div>
        <div className="vh-a">
          <button type="button" className="btn pri" onClick={() => setNewOpen(true)}>
            <UvIcon name="plus" />Nuevo partner
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi info">
          <b>{activeOutside}</b>
          <span>Partners activos</span>
          <small>más el partner interno</small>
        </div>
        <div className="kpi ok">
          <b>{money(mrr)}</b>
          <span>Abonos de su cartera</span>
          <small>por mes</small>
        </div>
        <div className={`kpi${debt ? ' warn' : ''}`}>
          <b>{money(debt)}</b>
          <span>Comisiones por liquidar</span>
          <small>meses ya cerrados</small>
        </div>
        <div className={`kpi${unassigned ? ' warn' : ''}`}>
          <b>{unassigned}</b>
          <span>Demos sin partner</span>
          <small>para asignar</small>
        </div>
      </div>

      <div className="card tbl-w">
        <table className="tbl pts">
          <thead>
            <tr>
              <th>Partner</th>
              <th>Clientes</th>
              <th>Abonos por mes</th>
              <th>Comisión</th>
              <th>{mLabel(prev)}</th>
              <th>Por liquidar</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const q = liqOf(db, p.id, prev);
              const a = pComm(db, p.id, prev);
              const d = pDebt(db, p.id);
              return (
                <tr key={p.id} tabIndex={0} role="link" onClick={() => open(p.id)} onKeyDown={(e) => onKey(e, p.id)}>
                  <td data-l="Partner">
                    <div className="cn">
                      <PartnerLogo p={p} />
                      <div>
                        <b>{p.name}</b>
                        {p.house ? <em className="tag">Interno</em> : null}
                        {!p.house && p.active === false ? <em className="tag" style={{ background: '#fde8e8', color: '#b42318' }}>Suspendido</em> : null}
                        <small>{p.owner} · {p.city}</small>
                      </div>
                    </div>
                  </td>
                  <td data-l="Clientes"><b>{pActive(db, p.id)}</b><small>{pClients(db, p.id)} clientes</small></td>
                  <td data-l="Abonos"><b>{money(pMrr(db, p.id))}</b></td>
                  <td data-l="Comisión"><b>{p.house ? '—' : `${p.pct}%`}</b></td>
                  <td data-l="Mes anterior">
                    {p.house
                      ? <small>sin comisión</small>
                      : a
                        ? <><b>{money(a)}</b><small>{q ? `liquidada el ${fDs(q.at)}` : 'sin liquidar'}</small></>
                        : <small>sin cobros</small>}
                  </td>
                  <td data-l="Por liquidar">
                    {p.house
                      ? '—'
                      : d
                        ? <span className="bdg warn">{money(d)}</span>
                        : <span className="bdg ok">Al día</span>}
                  </td>
                  <td className="ra"><span className="go"><UvIcon name="right" /></span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ch">
          <h3 className="ct">Cobrado por partner · {mLabel(cur)}</h3>
        </div>
        <div className="pt-bars">
          {list.map((p) => {
            const value = pColl(db, p.id, cur);
            return (
              <div key={p.id}>
                <span>{p.short || p.name}</span>
                <i style={{ '--w': `${Math.round((value / maxColl) * 100)}%`, '--c': p.color } as CSSProperties} />
                <b>{money(value)}</b>
              </div>
            );
          })}
        </div>
        <p className="muted sm" style={{ marginTop: 10 }}>Lo que pagaron en el mes los clientes de cada partner (clientes).</p>
      </div>

      <PartnerModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}
