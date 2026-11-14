import { useEffect, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { MODS, clubPrice, plan, specialOn } from '../../demo/selectors';
import { money, nS } from '../../demo/format';
import { actorOf, changePlan } from '../../demo/actions';
import type { PlanId } from '../../demo/types';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

interface PlanModalProps {
  open: boolean;
  clubId: string;
  onClose: () => void;
}

export function PlanModal({ open, clubId, onClose }: PlanModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const c = db.clubs.find((x) => x.id === clubId);
  const [next, setNext] = useState<PlanId>('basico');

  useEffect(() => {
    if (open && c) setNext(c.plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clubId]);

  if (!c) return null;
  const current = plan(db, c.plan);
  const chosen = plan(db, next);
  const add = chosen.mods.filter((m) => !current.mods.includes(m));
  const rem = current.mods.filter((m) => !chosen.mods.includes(m));

  const note = next === c.plan
    ? 'Es el plan que tiene ahora.'
    : `${add.length ? `Se activan: ${add.map((m) => MODS[m][0]).join(', ')}. ` : ''}${rem.length ? `Se apagan: ${rem.map((m) => MODS[m][0]).join(', ')}. ` : ''}El nuevo precio (${money(clubPrice(db, c, next))} con ${nS(c.socios)}${specialOn(c) ? ', sin el precio especial' : ''}) se cobra desde el próximo pago.`;

  const save = () => {
    if (next === c.plan) { onClose(); return; }
    mutate((draft) => changePlan(draft, c.id, next, actorOf(user)));
    onClose();
    showToast(<><b>{c.name}</b> pasó al plan {chosen.name}</>);
  };

  return (
    <Modal open={open} title="Cambiar de plan" onClose={onClose}>
      <p className="muted">{c.name}. Los módulos del cliente se prenden o apagan al instante.</p>
      <div className="plan-pick">
        {db.plans.map((p) => (
          <label className={`pp ${p.id === next ? 'on' : ''}`} key={p.id}>
            <input type="radio" name="pp" value={p.id} checked={p.id === next} onChange={() => setNext(p.id)} />
            <b>{p.name}</b>
            <span>{money(clubPrice(db, c, p.id))} por mes</span>
            <small>{p.mods.length} módulos extra · con {nS(c.socios)}{p.id === c.plan ? ' · plan actual' : ''}</small>
          </label>
        ))}
      </div>
      <p className="muted sm">{note}</p>
      <div className="m-a">
        <button type="button" className="btn pri" onClick={save}>Cambiar plan</button>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
