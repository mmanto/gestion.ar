import { useAuth } from '../../../hooks/useAuth';
import { useTenant } from '../../../hooks/useTenant';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  operativo: 'Operativo',
};

/** Datos de la cuenta dentro del tema UrbanVoice. */
export default function AccountBlock() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || '';

  return (
    <section className="card uv-set-card">
      <header className="uv-set-head">
        <div>
          <h3>Mi cuenta</h3>
          <p>Los datos con los que entrás al panel.</p>
        </div>
        <span className="uv-set-tag">{ROLE_LABEL[user?.role || 'operativo'] || 'Operativo'}</span>
      </header>

      <div className="uv-set-account">
        <div>
          <span className="uv-set-label">Nombre</span>
          <b>{fullName || '—'}</b>
        </div>
        <div>
          <span className="uv-set-label">Usuario</span>
          <b>{user?.username || '—'}</b>
        </div>
        <div>
          <span className="uv-set-label">Correo</span>
          <b>{user?.email || '—'}</b>
        </div>
        <div>
          <span className="uv-set-label">Organización</span>
          <b>{tenant?.name || '—'}</b>
        </div>
      </div>
    </section>
  );
}
