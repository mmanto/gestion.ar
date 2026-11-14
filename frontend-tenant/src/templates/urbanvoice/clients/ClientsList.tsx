import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoDb } from '../demo/store';
import {
  TIPOS, badgeMeta, clubPrice, counts, filterClubs, health, healthMeta, inSetup, plan, setupPct, specialOn, state,
} from '../demo/selectors';
import { fDs, initials, money, nS } from '../demo/format';
import type { Club, ClubStateKey, ListFilters } from '../demo/types';
import { useUvPermissions } from '../permissions';

const CHIPS: Array<[ClubStateKey | '', string]> = [
  ['', 'Todos'],
  ['activo', 'Al día'],
  ['pronto', 'Vence pronto'],
  ['prueba', 'En prueba'],
  ['atrasado', 'Pago atrasado'],
  ['suspendido', 'Suspendido'],
  ['baja', 'Dado de baja'],
];

const blank: ListFilters = { q: '', st: '', plan: '', part: '', tipo: '' };

export default function ClientsList() {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ListFilters>(blank);
  const c = counts(db);
  const rows = filterClubs(db, filters);

  const open = (clubId: string) => navigate(`/clients/${clubId}`);
  const onKey = (e: KeyboardEvent, clubId: string) => {
    if (e.key === 'Enter') open(clubId);
  };

  const subtitle = `${c.all - c.baja} clientes en la plataforma · ${c.baja} dados de baja`;

  return (
    <>
      <div className="vh">
        <div>
          <h1>Clientes</h1>
          <p className="muted">{subtitle}</p>
        </div>
      </div>

      <div className="card flt">
        <div className="srch in">
          <svg className="i"><use href="#o-search" /></svg>
          <input
            id="cf-q"
            placeholder="Buscar por nombre, localidad o responsable"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <div className="chips" id="cf-st">
          {CHIPS.map(([key, label]) => (
            <button
              type="button"
              key={key || 'all'}
              data-s={key}
              className={filters.st === key ? 'on' : ''}
              onClick={() => setFilters({ ...filters, st: key })}
            >
              {key ? <span className={`dot ${badgeMeta(key).tone}`} /> : null}
              {label} <em>{key ? c[key] : c.all}</em>
            </button>
          ))}
        </div>
        <select value={filters.plan} onChange={(e) => setFilters({ ...filters, plan: e.target.value })}>
          <option value="">Todos los planes</option>
          {db.plans.map((p) => (
            <option value={p.id} key={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filters.part} onChange={(e) => setFilters({ ...filters, part: e.target.value })}>
          <option value="">Todos los partners</option>
          {db.partners.map((p) => (
            <option value={p.id} key={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filters.tipo} onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}>
          <option value="">Todos los tipos</option>
          {TIPOS.filter((t) => db.clubs.some((club) => club.tipo === t)).map((t) => (
            <option value={t} key={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="card tbl-w">
        <table className="tbl clubs">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Plan</th>
              <th>Estado</th>
              {perms.money ? <th>Abono</th> : null}
              <th>Uso</th>
              <th />
            </tr>
          </thead>
          <tbody id="cl-b">
            {rows.map((club: Club) => {
              const S = state(db, club);
              const p = plan(db, club.plan);
              const H = health(db, club);
              const partner = db.partners.find((x) => x.id === club.partner);
              return (
                <tr
                  key={club.id}
                  data-club={club.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => open(club.id)}
                  onKeyDown={(e) => onKey(e, club.id)}
                >
                  <td data-l="Cliente">
                    <div className="cn">
                      <span className="clogo" style={{ width: 40, height: 40, background: club.color, fontSize: 15 }}>
                        {initials(club.name)}
                      </span>
                      <div>
                        <b>{club.name}</b>
                        {partner ? <em className="tag pt" title="Partner">{partner.short || partner.name}</em> : null}
                        <small>
                          {club.tipo || 'Cliente'} · {club.city}, {club.prov} · {club.owner}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td data-l="Plan">
                    <span className={`pl pl-${p.id}`}>{p.name}</span>
                    <small>{nS(club.socios)}</small>
                  </td>
                  <td data-l="Estado">
                    <span className={`bdg ${badgeMeta(S.k).tone}`}>{badgeMeta(S.k).label}</span>
                  </td>
                  {perms.money ? (
                    <td data-l="Abono">
                      <b>{money(clubPrice(db, club))}</b>
                      {specialOn(club) ? <em className="tag">Especial</em> : null}
                      <small>
                        {S.k === 'baja'
                          ? 'dado de baja'
                          : S.k === 'prueba'
                            ? `prueba hasta el ${fDs(S.due)}`
                            : `${S.left >= 0 ? 'vence' : 'venció'} el ${fDs(S.due)}`}
                      </small>
                    </td>
                  ) : null}
                  <td data-l="Uso">
                    {H.k !== 'off' ? <span className={`bdg ${healthMeta(H.k).tone}`}>{healthMeta(H.k).label}</span> : null}
                    {inSetup(db, club) ? <small>Puesta en marcha {setupPct(club)}%</small> : null}
                  </td>
                  <td className="ra"><span className="go"><svg className="i"><use href="#o-right" /></svg></span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length ? null : (
          <div className="empty">
            <svg className="i"><use href="#o-search" /></svg>
            <b>No hay clientes con ese filtro</b>
            <span>Probá con otro estado o borrá la búsqueda.</span>
          </div>
        )}
      </div>
    </>
  );
}
