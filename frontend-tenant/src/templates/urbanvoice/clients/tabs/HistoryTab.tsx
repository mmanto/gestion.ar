import { useDemoDb } from '../../demo/store';
import { userName } from '../../demo/selectors';
import { fD, initials, relTs } from '../../demo/format';
import { useUvPermissions } from '../../permissions';

const ICON: Record<string, string> = { pay: '$', new: '+', baja: '×', remind: '✆', sus: '‖', react: '▶', plan: '⇅', edit: '✎' };

interface HistoryTabProps {
  clubId: string;
}

const MONEY_LOG = new Set(['pay', 'plan', 'sus', 'baja', 'react']);
const MONEY_ACTION = new Set(['Pago', 'Plan', 'Suspensión', 'Baja', 'Reactivación']);

export default function HistoryTab({ clubId }: HistoryTabProps) {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const log = db.log
    .filter((l) => l.club === clubId)
    .filter((l) => perms.money || (!MONEY_LOG.has(l.t) && !l.txt.includes('$')))
    .slice(0, 30);
  const audit = db.audit
    .filter((a) => a.club === clubId)
    .filter((a) => perms.money || (!MONEY_ACTION.has(a.action) && !a.detail.includes('$')))
    .slice(0, 30);

  return (
    <div className="g2 club-g">
      <div>
        <section className="card">
          <div className="ch"><h3>Actividad</h3></div>
          <div className="act sm">
            {log.length ? log.map((l, i) => (
              <div key={`${l.at}-${i}`}>
                <span className={`ai ${l.t}`}>{ICON[l.t] || '•'}</span>
                <div><small>{l.txt}</small></div>
                <time>{fD(l.at)}</time>
              </div>
            )) : <p className="muted">Sin movimientos.</p>}
          </div>
        </section>
      </div>
      <div>
        <section className="card">
          <div className="ch"><h3>Quién hizo cada cambio</h3></div>
          {audit.length ? (
            <div className="act sm">
              {audit.map((a, i) => (
                <div key={`${a.ts}-${i}`}>
                  <span className="av xs">{initials(userName(db, a.user, a.userName))}</span>
                  <div>
                    <b>{userName(db, a.user, a.userName)}</b>
                    <small>{a.action} · {a.detail}</small>
                  </div>
                  <time>{relTs(a.ts)}</time>
                </div>
              ))}
            </div>
          ) : <p className="muted sm">Sin cambios registrados.</p>}
        </section>
      </div>
    </div>
  );
}
