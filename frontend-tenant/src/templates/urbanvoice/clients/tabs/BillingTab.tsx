import { useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { clubPays } from '../../demo/selectors';
import { fD, fDs, money } from '../../demo/format';
import { actorOf, voidPayment } from '../../demo/actions';
import { downloadPaysCsv, openReceipt, receiptWa } from '../../demo/receipt';
import type { Pay } from '../../demo/types';
import { useUvPermissions } from '../../permissions';
import { UvIcon } from '../../ui/UvIcon';
import { useToast } from '../../ui/Toast';
import { AbonoCard } from '../AbonoCard';
import { ConfirmModal } from '../modals/ConfirmModal';

interface BillingTabProps {
  clubId: string;
}

export default function BillingTab({ clubId }: BillingTabProps) {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [voiding, setVoiding] = useState<Pay | null>(null);
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return null;
  const pays = clubPays(db, c.id);
  const hist = (c.hist || []).slice().sort((a, b) => b.at.localeCompare(a.at));

  const doVoid = () => {
    if (!voiding) return;
    mutate((draft) => voidPayment(draft, voiding.id, actorOf(user)));
    setVoiding(null);
    showToast('Pago anulado');
  };

  return (
    <div className="g2 club-g">
      <div>
        <AbonoCard clubId={c.id} />
        <section className="card">
          <div className="ch">
            <h3>Pagos</h3>
            {pays.length ? (
              <button type="button" className="btn sm ghost" onClick={() => downloadPaysCsv(db, c.id)}><UvIcon name="down" />Descargar</button>
            ) : null}
          </div>
          {pays.length ? (
            <div className="tbl-w">
              <table className="tbl pays">
                <thead>
                  <tr><th>Fecha</th><th>Período</th><th>Medio</th><th className="r">Monto</th><th /></tr>
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
                      <td className="ra acts">
                        <button type="button" className="ico sm tint" title="Ver recibo" aria-label="Ver recibo" onClick={() => openReceipt(db, x.id)}>
                          <UvIcon name="down" />
                        </button>
                        <a className="ico sm tint" href={receiptWa(db, x.id) || '#'} target="_blank" rel="noopener noreferrer" title="Enviar recibo" aria-label="Enviar recibo">
                          <UvIcon name="wa" />
                        </a>
                        {perms.pay ? (
                          <button type="button" className="ico sm tint" title="Anular pago" aria-label="Anular pago" onClick={() => setVoiding(x)}>
                            <UvIcon name="trash" />
                          </button>
                        ) : null}
                      </td>
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
      <ConfirmModal
        open={!!voiding}
        title="Anular pago"
        description={voiding ? `Se borra el pago de ${money(voiding.amount)} del ${fD(voiding.date)} (recibo ${String(voiding.n || 0).padStart(6, '0')}). El vencimiento del cliente vuelve a calcularse con los pagos que quedan.` : null}
        confirmLabel="Anular pago"
        danger
        onConfirm={doVoid}
        onClose={() => setVoiding(null)}
      />
    </div>
  );
}
