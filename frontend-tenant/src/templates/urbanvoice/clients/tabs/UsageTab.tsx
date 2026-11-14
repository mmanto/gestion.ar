import { useDemoDb } from '../../demo/store';
import { SETUP, health, healthMeta, setupPct } from '../../demo/selectors';
import { TODAY, diff, pd, rel } from '../../demo/format';
import { UvIcon } from '../../ui/UvIcon';

export function WeekBars({ values }: { values: number[] }) {
  const W = 300;
  const H = 70;
  const max = Math.max(1, ...values);
  const bw = values.length ? W / values.length : W;
  return (
    <svg className="wk" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Movimientos por semana">
      {values.map((v, i) => {
        const h = Math.max(v ? 2 : 0, (v / max) * (H - 6));
        const label = i - values.length + 1 === 0 ? 'actual' : `hace ${values.length - 1 - i}`;
        return (
          <rect
            key={i}
            data-tip={`<b>Semana ${label}</b><br>${v} movimientos`}
            x={i * bw + bw * 0.15}
            y={H - h}
            width={bw * 0.7}
            height={h}
            rx={2}
            className={i === values.length - 1 ? 'cur' : ''}
          />
        );
      })}
    </svg>
  );
}

interface UsageTabProps {
  clubId: string;
}

export default function UsageTab({ clubId }: UsageTabProps) {
  const db = useDemoDb();
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return null;
  const u = c.usage || { w: [], players: 0, last: null };
  const w = u.w || [];
  const H = health(db, c);
  const pct = setupPct(c);
  const month = w.slice(-4).reduce((a, x) => a + x, 0);
  const per100 = Math.round((month / 4) / Math.max(1, c.socios / 100));
  const lastLabel = u.last ? (diff(TODAY, pd(u.last)!) === 0 ? 'Hoy' : rel(u.last).replace('hace ', '')) : '—';

  return (
    <div className="g2 club-g">
      <div>
        <section className="card">
          <div className="ch">
            <h3 className="ct"><span className="cti"><UvIcon name="pulse" /></span>Uso del cliente</h3>
            {H.k !== 'off' ? <span className={`bdg ${healthMeta(H.k).tone}`}>{healthMeta(H.k).label}</span> : null}
          </div>
          <div className="us-k">
            <div><b>{month}</b><small>movimientos en 4 semanas</small></div>
            <div><b>{per100}</b><small>por cada 100 vecinos por semana</small></div>
            <div><b>{(u.players || 0).toLocaleString('es-AR')}</b><small>vecinos con acceso online</small></div>
            <div><b>{lastLabel}</b><small>último ingreso al panel</small></div>
          </div>
          <WeekBars values={w} />
          <p className="us-f">
            {H.why ? `${H.why}. ` : ''}Movimientos: reclamos recibidos, altas de vecinos y avisos. Solo ves la actividad, no la facturación del cliente.
          </p>
        </section>
      </div>
      <div>
        <section className="card">
          <div className="ch">
            <h3 className="ct"><span className="cti"><UvIcon name="check" /></span>Puesta en marcha</h3>
            <span className={`chip-s ${pct === 100 ? '' : 'hot'}`}>{pct}%</span>
          </div>
          <div className="sp-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="sp-l">
            {SETUP.map(([key, label]) => {
              const done = !!(c.setup || {})[key];
              return (
                <label className={`ck ${done ? 'done' : ''}`} key={key}>
                  {done ? <UvIcon name="check" /> : null}
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
