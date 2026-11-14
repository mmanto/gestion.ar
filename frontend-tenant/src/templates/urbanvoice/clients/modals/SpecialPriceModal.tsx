import { useEffect, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { clubPrice, plan } from '../../demo/selectors';
import { TODAY, fD, iso, money, nS } from '../../demo/format';
import { actorOf, setSpecialPrice } from '../../demo/actions';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

type Kind = '' | 'pct' | 'fixed';

interface SpecialPriceModalProps {
  open: boolean;
  clubId: string;
  onClose: () => void;
}

export function SpecialPriceModal({ open, clubId, onClose }: SpecialPriceModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const c = db.clubs.find((x) => x.id === clubId);
  const [kind, setKind] = useState<Kind>('');
  const [value, setValue] = useState('');
  const [until, setUntil] = useState('');
  const [why, setWhy] = useState('');

  useEffect(() => {
    if (!open || !c) return;
    const s = c.special;
    setKind(s?.type || '');
    setValue(s ? String(s.value) : '');
    setUntil(s?.until || '');
    setWhy(s?.why || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clubId]);

  if (!c) return null;
  const list = clubPrice(db, c, c.plan);
  const num = +value || 0;
  const result = kind === 'pct' ? Math.round((list * (1 - num / 100)) / 100) * 100 : kind === 'fixed' ? num : list;

  const save = () => {
    if (kind && !(num > 0)) return;
    if (kind === 'pct' && num >= 100) return;
    mutate((draft) => setSpecialPrice(draft, c.id, kind ? { type: kind, value: num, until: until || undefined, why: why.trim() || undefined } : null, actorOf(user)));
    onClose();
    showToast('Precio guardado');
  };

  return (
    <Modal open={open} title="Precio especial" onClose={onClose}>
      <p className="muted">{c.name} · plan {plan(db, c.plan).name} con {nS(c.socios)}: precio de lista <b>{money(list)}</b> por mes.</p>
      <form id="sp-f" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label>Tipo</label>
        <div className="seg" id="sp-t">
          <button type="button" data-t="" className={kind === '' ? 'on' : ''} onClick={() => setKind('')}>Sin precio especial</button>
          <button type="button" data-t="pct" className={kind === 'pct' ? 'on' : ''} onClick={() => setKind('pct')}>Descuento %</button>
          <button type="button" data-t="fixed" className={kind === 'fixed' ? 'on' : ''} onClick={() => setKind('fixed')}>Precio fijo</button>
        </div>
        {kind ? (
          <div className="fg2">
            <div>
              <label>{kind === 'pct' ? 'Descuento (%)' : 'Precio por mes ($)'}</label>
              <input type="number" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div>
              <label>Hasta (opcional)</label>
              <input type="date" value={until} min={iso(TODAY)} onChange={(e) => setUntil(e.target.value)} />
            </div>
          </div>
        ) : null}
        {kind ? (
          <>
            <label>Motivo</label>
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ej: cliente fundador, acuerdo por 6 meses…" />
          </>
        ) : null}
        <div className="pay-sum">
          {kind
            ? <>Va a pagar <b>{money(result)}</b> por mes en vez de {money(list)}{until ? ` hasta el ${fD(until)}; después vuelve al precio de lista` : ''}. Se aplica desde el próximo pago.</>
            : <>Paga el precio de lista: <b>{money(list)}</b> por mes.</>}
        </div>
        <div className="m-a">
          <button className="btn pri" type="submit">Guardar</button>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
