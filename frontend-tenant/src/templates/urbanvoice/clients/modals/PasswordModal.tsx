import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { siteUrl } from '../../demo/selectors';
import { waLink } from '../../demo/format';
import { actorOf, logAdd } from '../../demo/actions';
import { Modal } from '../../ui/Modal';
import { UvIcon } from '../../ui/UvIcon';

const genPass = (): string => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
};

interface PasswordModalProps {
  open: boolean;
  clubId: string;
  onClose: () => void;
}

export function PasswordModal({ open, clubId, onClose }: PasswordModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const c = db.clubs.find((x) => x.id === clubId);
  const [pw, setPw] = useState('');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open || !c) { wasOpen.current = false; return; }
    setPw(genPass());
    if (!wasOpen.current) {
      wasOpen.current = true;
      mutate((draft) => logAdd(draft, c.id, 'edit', 'Contraseña del panel reseteada', actorOf(user)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clubId]);

  if (!c) return null;
  const url = siteUrl(db, c);
  const access = `Hola ${c.owner.split(' ')[0]}! Ya está listo ${c.name} en UrbanVoice.\n\nTu sitio: https://${url}\nPanel del cliente: https://${url}/panel\nUsuario: ${c.user}\nContraseña: ${pw}\n\nCualquier duda escribinos por acá.`;

  return (
    <Modal open={open} title="Nueva contraseña" onClose={onClose}>
      <p className="muted">Para el usuario <b>{c.user}</b> de {c.name}. La anterior deja de funcionar.</p>
      <div className="pw">{pw}</div>
      <div className="m-a">
        <a className="btn pri" target="_blank" rel="noopener noreferrer" href={waLink(c.phone, access)}><UvIcon name="wa" />Enviar por WhatsApp</a>
        <button type="button" className="btn" onClick={onClose}>Listo</button>
      </div>
    </Modal>
  );
}
