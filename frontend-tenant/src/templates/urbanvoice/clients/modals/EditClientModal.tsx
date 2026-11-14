import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { TIPOS, clubPrice } from '../../demo/selectors';
import { actorOf, updateClubData } from '../../demo/actions';
import { money } from '../../demo/format';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

const PROVS = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];

interface EditClientModalProps {
  open: boolean;
  clubId: string;
  onClose: () => void;
}

export function EditClientModal({ open, clubId, onClose }: EditClientModalProps) {
  const db = useDemoDb();
  const { user } = useAuth();
  const { showToast } = useToast();
  const c = db.clubs.find((x) => x.id === clubId);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [prov, setProv] = useState('');
  const [owner, setOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [tipo, setTipo] = useState('');
  const [socios, setSocios] = useState(1);
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    if (!open || !c) return;
    setName(c.name);
    setCity(c.city);
    setProv(c.prov);
    setOwner(c.owner);
    setPhone(c.phone);
    setTipo(c.tipo);
    setSocios(c.socios);
    setEmail(c.email);
    setSlug(c.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clubId]);

  if (!c) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9-]+$/.test(slug)) return;
    if (db.clubs.some((x) => x.id !== c.id && x.slug === slug)) {
      showToast('Esa dirección web ya la usa otro cliente');
      return;
    }
    const nextSocios = Math.max(1, Math.trunc(socios) || c.socios);
    const prev = clubPrice(db, c);
    const next = clubPrice(db, { ...c, socios: nextSocios });
    try {
      mutate((draft) => updateClubData(draft, c.id, { name: name.trim(), city: city.trim(), prov: prov.trim(), owner: owner.trim(), phone: phone.trim(), email: email.trim(), tipo, socios: nextSocios, slug }, actorOf(user)));
    } catch {
      showToast('Esa dirección web ya la usa otro cliente');
      return;
    }
    onClose();
    showToast(next !== prev
      ? <>Datos guardados. El abono pasa de {money(prev)} a <b>{money(next)}</b> desde el próximo pago</>
      : 'Datos guardados');
  };

  return (
    <Modal open={open} title="Datos del cliente" onClose={onClose}>
      <form id="ed-f" onSubmit={submit}>
        <label>Nombre del cliente</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="fg2">
          <div><label>Localidad</label><input value={city} onChange={(e) => setCity(e.target.value)} required /></div>
          <div><label>Provincia</label><input value={prov} onChange={(e) => setProv(e.target.value)} list="provs" required /></div>
        </div>
        <div className="fg2">
          <div><label>Responsable</label><input value={owner} onChange={(e) => setOwner(e.target.value)} required /></div>
          <div><label>WhatsApp</label><input value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
        </div>
        <div className="fg2">
          <div>
            <label>Tipo de cliente</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label>Cantidad de vecinos</label><input type="number" min={1} max={200000} value={socios} onChange={(e) => setSocios(+e.target.value)} /></div>
        </div>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Dirección web</label>
        <div className="slug">
          <input value={slug} pattern="[a-z0-9\-]+" onChange={(e) => setSlug(e.target.value.toLowerCase())} required />
          <span>.{db.cfg.domain}</span>
        </div>
        <div className="m-a">
          <button className="btn pri" type="submit">Guardar</button>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </form>
      <datalist id="provs">
        {PROVS.map((p) => <option value={p} key={p} />)}
      </datalist>
    </Modal>
  );
}
