import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { actorOf, savePartner } from '../../demo/actions';
import type { Partner } from '../../demo/types';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

const codeOf = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '').slice(0, 16);

interface PartnerModalProps {
  open: boolean;
  partnerId?: string;
  onClose: () => void;
}

/** Alta y edición de partners (la hace la administración). */
export function PartnerModal({ open, partnerId, onClose }: PartnerModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const p: Partner | undefined = partnerId ? db.partners.find((x) => x.id === partnerId) : undefined;

  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [pct, setPct] = useState(20);
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(p?.name || '');
    setOwner(p?.owner || '');
    setEmail(p?.email || '');
    setPhone(p?.phone || '');
    setCity(p?.city || '');
    setPct(p?.pct ?? 20);
    setCode(p?.code || '');
    setCodeTouched(!!p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partnerId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toLowerCase();
    const cleanMail = email.trim().toLowerCase();
    if (db.partners.some((x) => x.id !== p?.id && x.code === cleanCode)) {
      showToast('Ese código ya lo usa otro partner');
      return;
    }
    if (!p && db.partners.some((x) => x.users.some((u) => u.email.toLowerCase() === cleanMail))) {
      showToast('Ese email ya es usuario de otro partner');
      return;
    }
    let id = p?.id;
    mutate((draft) => {
      const saved = savePartner(
        draft,
        { name, owner, email, phone, city, prov: p?.prov, pct, code: cleanCode },
        actorOf(user),
        p?.id,
      );
      id = saved.id;
    });
    onClose();
    if (p) {
      showToast('Cambios guardados');
    } else {
      showToast(<>¡<b>{name}</b> ya es partner!</>);
      if (id) navigate(`/partners/${id}`);
    }
  };

  return (
    <Modal open={open} title={p ? 'Editar partner' : 'Nuevo partner'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <label>Nombre de la empresa o persona</label>
        <input value={name} onChange={(e) => { setName(e.target.value); if (!codeTouched) setCode(codeOf(e.target.value)); }} required readOnly={p?.house} />

        <div className="fg3">
          <div><label>Responsable</label><input value={owner} onChange={(e) => setOwner(e.target.value)} required /></div>
          <div><label>WhatsApp</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
          <div><label>Email (su usuario)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        </div>

        <div className="fg3">
          <div><label>Ciudad</label><input value={city} onChange={(e) => setCity(e.target.value)} required /></div>
          <div><label>Comisión (%)</label><input type="number" min={0} max={60} step={1} value={pct} onChange={(e) => setPct(+e.target.value)} required readOnly={p?.house} /></div>
          <div>
            <label>Código del link</label>
            <input
              value={code}
              placeholder="ej: estudiosur"
              required
              pattern="[a-z0-9]+"
              readOnly={p?.house}
              onChange={(e) => { setCodeTouched(true); setCode(codeOf(e.target.value)); }}
            />
          </div>
        </div>

        <p className="muted sm">
          {p ? 'Cambiar la comisión vale desde los cobros que lleguen después.' : 'Con su link de ventas (?p=código) los pedidos de demo quedan a su nombre.'}
        </p>

        <div className="m-a">
          <button className="btn pri" type="submit">{p ? 'Guardar' : 'Crear partner'}</button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
