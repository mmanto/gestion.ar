import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { club, pName } from '../../demo/selectors';
import { actorOf, reassignClubPartner } from '../../demo/actions';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

interface ReassignPartnerModalProps {
  open: boolean;
  clubId: string;
  onClose: () => void;
}

/** La administración puede pasar un cliente de un partner a otro (el partner no puede). */
export function ReassignPartnerModal(props: ReassignPartnerModalProps) {
  if (!props.open) return null;
  return <ReassignPartnerDialog key={`${props.clubId}-${props.open}`} {...props} />;
}

function ReassignPartnerDialog({ clubId, onClose }: ReassignPartnerModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const c = club(db, clubId);
  const current = c?.partner || '';
  const [partnerId, setPartnerId] = useState(current);

  if (!c) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (partnerId === current) {
      onClose();
      return;
    }
    mutate((draft) => reassignClubPartner(draft, c.id, partnerId, actorOf(user)));
    onClose();
    showToast(`Partner actualizado a ${pName(db, partnerId)}`);
  };

  return (
    <Modal open title={`Partner de ${c.name}`} onClose={onClose}>
      <p className="muted">La comisión de los próximos cobros va al nuevo partner.</p>
      <form onSubmit={submit}>
        <label>Partner</label>
        <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          {db.partners
            .filter((p) => p.active !== false || p.id === current)
            .map((p) => (
              <option value={p.id} key={p.id}>{p.name}{p.house ? '' : ` · ${p.pct}%`}</option>
            ))}
        </select>
        <div className="m-a">
          <button className="btn pri" type="submit">Guardar</button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
