import { useCallback, useEffect, useState } from 'react';
import partnerTenantsService from '../../../../services/partnerTenants.service';
import type { TenantUser } from '../../../../types/tenantUser.types';
import { UvIcon } from '../../ui/UvIcon';
import { useToast } from '../../ui/Toast';
import { ConfirmModal } from '../modals/ConfirmModal';
import UserModal from '../modals/UserModal';

interface UsersTabProps {
  tenantId: string;
  canEdit: boolean;
}

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', operativo: 'Operativo' };

export default function UsersTab({ tenantId, canEdit }: UsersTabProps) {
  const { showToast } = useToast();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenantUser | null>(null);
  const [deleting, setDeleting] = useState<TenantUser | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await partnerTenantsService.listUsers(tenantId);
      setUsers(result.users);
    } catch {
      setError('No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveUser = (saved: TenantUser) => {
    setUsers((list) => {
      const exists = list.some((u) => u.username === saved.username);
      return exists ? list.map((u) => (u.username === saved.username ? saved : u)) : [...list, saved];
    });
    setModalOpen(false);
    setEditing(null);
    showToast(<>Usuario <b>{saved.username}</b> guardado</>);
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteError('');
    try {
      await partnerTenantsService.deleteUser(tenantId, deleting.username);
      setUsers((list) => list.filter((u) => u.username !== deleting.username));
      showToast(<>Usuario <b>{deleting.username}</b> eliminado</>);
      setDeleting(null);
    } catch {
      setDeleteError('No se pudo eliminar: el usuario puede tener recursos asociados.');
    }
  };

  return (
    <>
      <div className="card">
        <div className="vh" style={{ marginBottom: 8 }}>
          <div>
            <h3>Usuarios del cliente</h3>
            <p className="muted sm">Entran al panel del cliente con su propio usuario.</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="btn pri sm"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <UvIcon name="plus" />Nuevo usuario
            </button>
          ) : null}
        </div>

        {error ? <small className="lg-err">{error}</small> : null}

        {loading ? (
          <p className="muted">Cargando usuarios…</p>
        ) : users.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username}>
                  <td data-l="Usuario">
                    <b>{u.username}</b>
                    {u.email ? <small>{u.email}</small> : null}
                  </td>
                  <td data-l="Nombre">{[u.nombre, u.apellido].filter(Boolean).join(' ') || '—'}</td>
                  <td data-l="Rol">{ROLE_LABEL[u.role] || u.role}</td>
                  <td data-l="Estado">
                    <span className={`bdg ${u.disabled ? 'off' : 'ok'}`}>{u.disabled ? 'Deshabilitado' : 'Activo'}</span>
                  </td>
                  <td className="ra">
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => {
                            setEditing(u);
                            setModalOpen(true);
                          }}
                        >
                          Editar
                        </button>
                        <button type="button" className="btn sm danger" onClick={() => setDeleting(u)}>
                          Eliminar
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <b>Todavía no hay usuarios</b>
            <span>Creá el admin del cliente para que pueda entrar a su panel.</span>
          </div>
        )}
      </div>

      <UserModal
        open={modalOpen}
        tenantId={tenantId}
        user={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={saveUser}
      />

      <ConfirmModal
        open={Boolean(deleting)}
        title={`Eliminar a ${deleting?.username ?? ''}`}
        description="El usuario deja de poder entrar. No se puede deshacer."
        confirmLabel="Eliminar usuario"
        danger
        onConfirm={remove}
        onClose={() => {
          setDeleting(null);
          setDeleteError('');
        }}
      >
        {deleteError ? <small className="lg-err">{deleteError}</small> : null}
      </ConfirmModal>
    </>
  );
}
