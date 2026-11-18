import { useEffect, useState } from 'react';
import partnerTenantsService from '../../../../services/partnerTenants.service';
import { apiErrorDetail } from '../../../../utils/apiError';
import type { TenantUser, TenantUserRole } from '../../../../types/tenantUser.types';
import { Modal } from '../../ui/Modal';

interface UserModalProps {
  open: boolean;
  tenantId: string;
  /** Sin usuario es alta; con usuario, edición. */
  user: TenantUser | null;
  onClose: () => void;
  onSaved: (user: TenantUser) => void;
}

interface FormState {
  username: string;
  password: string;
  nombre: string;
  apellido: string;
  email: string;
  role: TenantUserRole;
  disabled: boolean;
}

const BLANK: FormState = {
  username: '', password: '', nombre: '', apellido: '', email: '', role: 'admin', disabled: false,
};

export default function UserModal({ open, tenantId, user, onClose, onSaved }: UserModalProps) {
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    setForm(
      user
        ? {
            username: user.username,
            password: '',
            nombre: user.nombre ?? '',
            apellido: user.apellido ?? '',
            email: user.email ?? '',
            role: user.role === 'operativo' ? 'operativo' : 'admin',
            disabled: user.disabled,
          }
        : BLANK,
    );
  }, [open, user]);

  const set = (key: 'username' | 'password' | 'nombre' | 'apellido' | 'email') => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = async () => {
    if (saving) return;
    if (!user && form.username.trim().length < 3) {
      setError('El usuario tiene que tener al menos 3 caracteres');
      return;
    }
    if (!user && form.password.length < 6) {
      setError('La contraseña tiene que tener al menos 6 caracteres');
      return;
    }
    if (user && form.password && form.password.length < 6) {
      setError('La contraseña nueva tiene que tener al menos 6 caracteres');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = user
        ? await partnerTenantsService.updateUser(tenantId, user.username, {
            role: form.role,
            disabled: form.disabled,
            nombre: form.nombre.trim() || undefined,
            apellido: form.apellido.trim() || undefined,
            email: form.email.trim() || undefined,
            password: form.password || undefined,
          })
        : await partnerTenantsService.createUser(tenantId, {
            username: form.username.trim(),
            password: form.password,
            role: form.role,
            nombre: form.nombre.trim() || undefined,
            apellido: form.apellido.trim() || undefined,
            email: form.email.trim() || undefined,
          });
      onSaved(saved);
    } catch (err) {
      setError(apiErrorDetail(err) || 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={user ? `Editar ${user.username}` : 'Nuevo usuario'} onClose={onClose}>
      {!user ? (
        <label htmlFor="us-user">Usuario</label>
      ) : null}
      {!user ? (
        <input id="us-user" value={form.username} onChange={set('username')} autoComplete="off" />
      ) : null}

      <label htmlFor="us-pass">{user ? 'Contraseña nueva (opcional)' : 'Contraseña'}</label>
      <input
        id="us-pass"
        type="password"
        value={form.password}
        onChange={set('password')}
        autoComplete="new-password"
        placeholder={user ? 'Dejar vacío para no cambiarla' : ''}
      />

      <div className="fg2">
        <div>
          <label htmlFor="us-nombre">Nombre</label>
          <input id="us-nombre" value={form.nombre} onChange={set('nombre')} />
        </div>
        <div>
          <label htmlFor="us-apellido">Apellido</label>
          <input id="us-apellido" value={form.apellido} onChange={set('apellido')} />
        </div>
      </div>
      <label htmlFor="us-email">Email</label>
      <input id="us-email" type="email" value={form.email} onChange={set('email')} />

      <label htmlFor="us-role">Rol</label>
      <select
        id="us-role"
        value={form.role}
        onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value === 'operativo' ? 'operativo' : 'admin' }))}
      >
        <option value="admin">Administrador</option>
        <option value="operativo">Operativo</option>
      </select>

      {user ? (
        <label className="ck" htmlFor="us-disabled">
          <input
            id="us-disabled"
            type="checkbox"
            checked={form.disabled}
            onChange={(e) => setForm((prev) => ({ ...prev, disabled: e.target.checked }))}
          />
          Cuenta deshabilitada
        </label>
      ) : null}

      {error ? <small className="lg-err">{error}</small> : null}

      <div className="m-a">
        <button type="button" className="btn pri" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : user ? 'Guardar' : 'Crear usuario'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
