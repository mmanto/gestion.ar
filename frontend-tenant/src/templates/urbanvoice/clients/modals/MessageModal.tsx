import { useEffect, useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { fillTemplate, tplList, tplSuggest } from '../../demo/messages';
import { waLink } from '../../demo/format';
import { actorOf, logMessage } from '../../demo/actions';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { UvIcon } from '../../ui/UvIcon';

interface MessageModalProps {
  open: boolean;
  clubId: string;
  onClose: () => void;
}

export function MessageModal({ open, clubId, onClose }: MessageModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const c = db.clubs.find((x) => x.id === clubId);
  const list = tplList(db);
  const [cur, setCur] = useState(list[0]?.id ?? 'pago');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open || !c) return;
    const suggested = tplSuggest(db, c);
    const tpl = list.find((x) => x.id === suggested) || list[0];
    setCur(tpl.id);
    setText(fillTemplate(db, tpl.text, c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clubId]);

  if (!c) return null;
  const suggested = tplSuggest(db, c);
  const choose = (id: string) => {
    const tpl = list.find((x) => x.id === id);
    if (!tpl) return;
    setCur(id);
    setText(fillTemplate(db, tpl.text, c));
  };

  const send = () => {
    window.open(waLink(c.phone, text), '_blank', 'noopener');
    const name = list.find((x) => x.id === cur)?.name || 'Mensaje';
    mutate((draft) => logMessage(draft, c.id, name, actorOf(user)));
    showToast(<>Mensaje abierto en WhatsApp para <b>{c.name}</b></>);
    onClose();
  };

  return (
    <Modal open={open} title={`Mensaje para ${c.name}`} onClose={onClose} wide>
      <p className="muted">A {c.owner} · {c.phone}. Elegí una plantilla y, si querés, ajustá el texto antes de mandarlo.</p>
      <div className="tpl-pick">
        {list.map((t) => (
          <button type="button" key={t.id} data-tp={t.id} className={t.id === cur ? 'on' : ''} onClick={() => choose(t.id)}>
            {t.name}{t.id === suggested ? <> <em>sugerido</em></> : null}
          </button>
        ))}
      </div>
      <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="m-a">
        <button type="button" className="btn pri" onClick={() => send()}><UvIcon name="wa" />Abrir en WhatsApp</button>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
