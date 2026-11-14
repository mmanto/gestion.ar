import { useEffect, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { useDemoDb, mutate } from '../../demo/store';
import { clubPrice, discFor, plan, priceFor, state } from '../../demo/selectors';
import { TODAY, addM, fD, iso, money, pd } from '../../demo/format';
import { actorOf, registerPayment } from '../../demo/actions';
import { openReceipt } from '../../demo/receipt';
import type { Pay } from '../../demo/types';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

const MONTHS = [1, 3, 6, 12];
const METHODS = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Otro'];

interface PayModalProps {
  open: boolean;
  clubId: string;
  onClose: () => void;
}

export function PayModal({ open, clubId, onClose }: PayModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const c = db.clubs.find((x) => x.id === clubId);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(iso(TODAY));
  const [method, setMethod] = useState('Transferencia');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || !c) return;
    setMonths(1);
    setAmount(priceFor(db, c, 1));
    setDate(iso(TODAY));
    setMethod('Transferencia');
    setNote('');
    // Sólo al abrir o cambiar de cliente: no resetear al tipear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clubId]);

  if (!c) return null;
  const S = state(db, c);
  const p = plan(db, c.plan);
  const from = S.trial ? (S.left >= 0 ? pd(c.trialEnd)! : TODAY) : pd(c.paidUntil)!;
  const expected = priceFor(db, c, months);
  const to = addM(from, months);
  const mismatch = amount > 0 && Math.abs(amount - expected) >= 100;

  const pickMonths = (m: number) => {
    setMonths(m);
    setAmount(priceFor(db, c, m));
  };

  const submit = () => {
    let created: Pay | undefined;
    mutate((draft) => {
      created = registerPayment(draft, c.id, { months, amount, date, method, note: note.trim() }, actorOf(user));
    });
    onClose();
    if (created) {
      const payId = created.id;
      showToast(
        <>
          Pago registrado. <b>{c.name}</b> queda al día hasta el {fD(to)}.{' '}
          <button type="button" className="tl-a" onClick={() => openReceipt(db, payId)}>Ver recibo</button>
        </>,
      );
    }
  };

  return (
    <Modal open={open} title="Registrar pago" onClose={onClose}>
      <p className="muted">
        {c.name} · plan {p.name} · {c.socios.toLocaleString('es-AR')} vecinos · {money(clubPrice(db, c))} por mes
      </p>
      <form id="pay-f" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label>¿Cuántos meses paga?</label>
        <div className="seg" id="pay-m">
          {MONTHS.map((m) => (
            <button type="button" key={m} data-m={m} className={m === months ? 'on' : ''} onClick={() => pickMonths(m)}>
              {m} {m === 1 ? 'mes' : 'meses'}
              {discFor(db, m) ? <small>−{discFor(db, m)}%</small> : null}
            </button>
          ))}
        </div>
        <div className="fg2">
          <div>
            <label>Monto</label>
            <input id="pay-a" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(+e.target.value)} required />
          </div>
          <div>
            <label>Fecha del pago</label>
            <input id="pay-d" type="date" value={date} max={iso(TODAY)} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        <label>Medio de pago</label>
        <select id="pay-w" value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <label>Nota (opcional)</label>
        <input id="pay-n" placeholder="Ej: nro. de comprobante" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="pay-sum" id="pay-s">
          Cubre del <b>{fD(from)}</b> al <b>{fD(addM(from, months))}</b>.
          {discFor(db, months) ? <> Precio con {discFor(db, months)}% de descuento: <b>{money(expected)}</b>.</> : null}
          {mismatch ? <><br /><span className="warn-t">El monto no coincide con lo que corresponde ({money(expected)}).</span></> : null}
          {S.k === 'suspendido' ? <><br />Al registrarlo, el cliente se reactiva solo.</> : null}
        </div>
        <div className="m-a">
          <button className="btn pri" type="submit">Registrar pago</button>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
