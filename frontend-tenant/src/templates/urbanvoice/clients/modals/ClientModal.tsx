import { useEffect, useState } from 'react';
import partnerTenantsService from '../../../../services/partnerTenants.service';
import { apiErrorDetail } from '../../../../utils/apiError';
import type { PartnerTenant } from '../../../../types/partnerTenant.types';
import { Modal } from '../../ui/Modal';

interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (client: PartnerTenant) => void;
}

interface FormState {
  name: string;
  domain: string;
  slug: string;
  username: string;
  password: string;
  email: string;
  nombre: string;
  apellido: string;
}

const BLANK: FormState = {
  name: '', domain: '', slug: '', username: '', password: '', email: '', nombre: '', apellido: '',
};

/**
 * Alta de un cliente = tenant hijo del tenant base. El backend clona el agente
 * y los módulos del padre y crea el admin del cliente en la misma transacción
 * (`POST /api/partner/tenants`).
 */
export default function ClientModal({ open, onClose, onCreated }: ClientModalProps) {
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(BLANK);
      setError('');
      setSaving(false);
    }
  }, [open]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async () => {
    if (saving) return;
    if (form.name.trim().length < 2) {
      setError('El nombre del cliente tiene que tener al menos 2 caracteres');
      return;
    }
    if (form.username.trim().length < 3) {
      setError('El usuario admin del cliente tiene que tener al menos 3 caracteres');
      return;
    }
    if (form.password.length < 6) {
      setError('La contraseña tiene que tener al menos 6 caracteres');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const client = await partnerTenantsService.createTenant({
        name: form.name.trim(),
        domain: form.domain.trim() || undefined,
        slug: form.slug.trim() || undefined,
        admin_user: {
          username: form.username.trim(),
          password: form.password,
          email: form.email.trim() || undefined,
          nombre: form.nombre.trim() || undefined,
          apellido: form.apellido.trim() || undefined,
        },
      });
      onCreated(client);
    } catch (err) {
      setError(apiErrorDetail(err) || 'No se pudo dar de alta el cliente. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Nuevo cliente" onClose={onClose} wide>
      <p className="muted">
        Se crea un panel propio para el cliente con el agente y los módulos de UrbanVoice ya configurados.
      </p>

      <label htmlFor="cl-name">Nombre del cliente</label>
      <input id="cl-name" value={form.name} onChange={set('name')} placeholder="Ej. Municipalidad de San Pedro" />

      <div className="fg2">
        <div>
          <label htmlFor="cl-domain">Dominio propio (opcional)</label>
          <input id="cl-domain" value={form.domain} onChange={set('domain')} placeholder="sanpedro.gob.ar" />
        </div>
        <div>
          <label htmlFor="cl-slug">Nombre interno (opcional)</label>
          <input id="cl-slug" value={form.slug} onChange={set('slug')} placeholder="san-pedro" />
        </div>
      </div>

      <h3 style={{ marginTop: 18 }}>Administrador del cliente</h3>
      <div className="fg2">
        <div>
          <label htmlFor="cl-user">Usuario</label>
          <input id="cl-user" value={form.username} onChange={set('username')} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="cl-pass">Contraseña inicial</label>
          <input
            id="cl-pass"
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="cl-nombre">Nombre</label>
          <input id="cl-nombre" value={form.nombre} onChange={set('nombre')} />
        </div>
        <div>
          <label htmlFor="cl-apellido">Apellido</label>
          <input id="cl-apellido" value={form.apellido} onChange={set('apellido')} />
        </div>
      </div>
      <label htmlFor="cl-email">Email (opcional)</label>
      <input id="cl-email" type="email" value={form.email} onChange={set('email')} />

      {error ? <small className="lg-err">{error}</small> : null}

      <div className="m-a">
        <button type="button" className="btn pri" onClick={submit} disabled={saving}>
          {saving ? 'Creando…' : 'Crear cliente'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
