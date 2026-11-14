import { useDemoDb } from '../../demo/store';
import { clubPays } from '../../demo/selectors';
import { fD, fDs, money } from '../../demo/format';
import { AbonoCard } from '../AbonoCard';

interface BillingTabProps {
  clubId: string;
}

export default function BillingTab({ clubId }: BillingTabProps) {
  const db = useDemoDb();
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return null;
  const pays = clubPays(db, c.id);
  const hist = (c.hist || []).slice().sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="g2 club-g">
      <div>
        <AbonoCard clubId={c.id} />
        <section className="card">
          <div className="ch"><h3>Pagos</h3></div>
          {pays.length ? (
            <div className="tbl-w">
              <table className="tbl pays">
                <thead>
                  <tr><th>Fecha</th><th>Período</th><th>Medio</th><th className="r">Monto</th></tr>
                </thead>
                <tbody>
                  {pays.map((x) => (
                    <tr key={x.id}>
                      <td data-l="Fecha">{fD(x.date)}<small>Recibo {String(x.n || 0).padStart(6, '0')}</small></td>
                      <td data-l="Período">
                        {fDs(x.from)} al {fDs(x.to)}
                        {x.months > 1 ? <em className="tag">{x.months} meses</em> : null}
                      </td>
                      <td data-l="Medio">{x.method}{x.note ? <small>{x.note}</small> : null}</td>
                      <td className="r" data-l="Monto"><b>{money(x.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty sm">
              <b>Todavía no pagó</b>
              <span>Registrá el primer pago para activar el abono.</span>
            </div>
          )}
        </section>
      </div>
      <div>
        <section className="card">
          <div className="ch"><h3>Historial del abono</h3></div>
          <div className="hs">
            {hist.map((x, i) => (
              <div className="hs-i" key={`${x.at}-${i}`}>
                <span className={`hs-d ${x.t}`} />
                <div>
                  <b>{x.txt}</b>
                  <small>{fD(x.at)}</small>
                </div>
                <em>{money(x.price)}<small>por mes</small></em>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
