import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { mLabel, pColl, pComm, partner } from '../../demo/selectors';
import { money, waLink } from '../../demo/format';
import { actorOf, settleCommission } from '../../demo/actions';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

const METHODS = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Compensación con facturas'];

interface SettlementModalProps {
  open: boolean;
  partnerId: string;
  ym: string | null;
  onClose: () => void;
}

/** Registra el pago de la comisión de un mes cerrado. */
export function SettlementModal({ open, partnerId, ym, onClose }: SettlementModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState(METHODS[0]);
  const [ref, setRef] = useState('');

  useEffect(() => {
    if (!open || !ym) return;
    setAmount(pComm(db, partnerId, ym));
    setMethod(METHODS[0]);
    setRef('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partnerId, ym]);

  const p = partner(db, partnerId);
  if (!p || !ym) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutate((draft) => settleCommission(draft, p.id, ym, { amount, method, ref }, actorOf(user)));
    onClose();
    showToast('Comisión registrada');
  };

  return (
    <Modal open={open} title="Liquidar comisión" onClose={onClose}>
      <p className="muted">
        <b>{p.name}</b> · {mLabel(ym)}: {money(pColl(db, p.id, ym))} cobrados × {p.pct}%.
      </p>
      <form onSubmit={submit}>
        <label>Monto a pagar</label>
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(+e.target.value)} required />
        <label>Medio</label>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <label>Referencia (opcional)</label>
        <input placeholder="Ej: transferencia 0001234" value={ref} onChange={(e) => setRef(e.target.value)} />
        <div className="m-a">
          <button className="btn pri" type="submit">Registrar pago</button>
          <a
            className="btn"
            target="_blank"
            rel="noopener noreferrer"
            href={waLink(p.phone, `Hola ${p.owner.split(' ')[0]}! Te pagamos la comisión de ${mLabel(ym)}: ${money(pComm(db, p.id, ym))}. ¡Gracias por vender UrbanVoice!`)}
          >
            Avisar
          </a>
        </div>
      </form>
    </Modal>
  );
}
