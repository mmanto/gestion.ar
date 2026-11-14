import { useDemoDb } from '../demo/store';
import { BASE_MODS, MODS, clubPays, clubPrice, plan, planRule, specialOn, state } from '../demo/selectors';
import { fD, money, rel } from '../demo/format';
import { useUvPermissions } from '../permissions';
import { LineIcon } from '../ui/LineIcon';
import { UvIcon } from '../ui/UvIcon';

/** Tarjeta «Abono» de la ficha (sólo lectura en esta tarea). */
export function AbonoCard({ clubId }: { clubId: string }) {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return null;
  const S = state(db, c);
  const p = plan(db, c.plan);
  const pays = clubPays(db, c.id);
  const total = pays.reduce((a, x) => a + x.amount, 0);

  return (
    <section className="card">
      <div className="ch"><h3>Abono</h3></div>
      {perms.money ? (
        <div className="ab">
          <div>
            <small>Abono mensual</small>
            <b>{money(clubPrice(db, c))}</b>
            <span>Plan {p.name} · {c.socios.toLocaleString('es-AR')} vecinos{specialOn(c) ? <> · <em className="tag">Precio especial</em></> : null}</span>
          </div>
          <div>
            <small>{S.trial ? 'Prueba hasta' : S.left >= 0 ? 'Pagado hasta' : 'Venció el'}</small>
            <b>{fD(S.due)}</b>
            <span>{S.k === 'baja' ? '—' : rel(S.due!)}</span>
          </div>
          <div>
            <small>Pagó en total</small>
            <b>{money(total)}</b>
            <span>{pays.length} {pays.length === 1 ? 'pago' : 'pagos'}</span>
          </div>
        </div>
      ) : (
        <p className="muted sm">Plan {p.name} · {c.socios.toLocaleString('es-AR')} vecinos</p>
      )}
      {perms.money ? (
        <div className="pr-b">
          <span>Plan {p.name}: {planRule(p)}</span>
          {specialOn(c) ? (
            <span className="pr-sp">
              <UvIcon name="cash" />
              Precio especial: {c.special!.type === 'pct'
                ? `${c.special!.value}% de descuento sobre ${money(clubPrice(db, c, c.plan))}`
                : `fijo en lugar de ${money(clubPrice(db, c, c.plan))}`}
              {c.special!.until ? ` hasta el ${fD(c.special!.until)}` : ''}
              {c.special!.why ? ` · ${c.special!.why}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mods">
        <small>Incluye</small>
        <div>
          <span className="m base">{BASE_MODS}</span>
          {p.mods.map((k) => (
            <span className="m" key={k}>
              <LineIcon emoji={MODS[k][1]} /> {MODS[k][0]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
