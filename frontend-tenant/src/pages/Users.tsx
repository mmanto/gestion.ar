import { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { AvatarPicker } from '../components/common/AvatarPicker';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import tenantUsersService from '../services/tenantUsers.service';
import type { TenantUser, TenantUserRole } from '../types/tenantUser.types';

const emptyCreateForm = {
  username: '', password: '', email: '', nombre: '', apellido: '', avatar_url: '', role: 'operativo' as TenantUserRole,
};

export const Users = () => {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState(emptyCreateForm);

  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; nombre: string; apellido: string; avatar_url: string; role: TenantUserRole }>({
    email: '', nombre: '', apellido: '', avatar_url: '', role: 'operativo',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tenantUsersService.listUsers(1, 100);
      setUsers(response.users);
    } catch (err) {
      setError('Error cargando usuarios');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) return;
    try {
      setCreating(true);
      await tenantUsersService.createUser({
        ...newUser,
        email: newUser.email || undefined,
        nombre: newUser.nombre || undefined,
        apellido: newUser.apellido || undefined,
        avatar_url: newUser.avatar_url || undefined,
      });
      setShowCreateModal(false);
      setNewUser(emptyCreateForm);
      fetchUsers();
    } catch (err) {
      console.error('Error creating user:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleDisabled = async (user: TenantUser) => {
    await tenantUsersService.updateUser(user.username, { disabled: !user.disabled });
    fetchUsers();
  };

  const openEditUser = (user: TenantUser) => {
    setEditingUser(user);
    setEditForm({
      email: user.email || '',
      nombre: user.nombre || '',
      apellido: user.apellido || '',
      avatar_url: user.avatar_url || '',
      role: (user.role as TenantUserRole) || 'operativo',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setSavingEdit(true);
      await tenantUsersService.updateUser(editingUser.username, {
        email: editForm.email || undefined,
        nombre: editForm.nombre || undefined,
        apellido: editForm.apellido || undefined,
        avatar_url: editForm.avatar_url || undefined,
        role: editForm.role,
      });
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      console.error('Error updating user:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading && users.length === 0) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="font-editorial p-1 md:bg-[#F8F9FD] md:p-8">
        <PageHeader
          title="Usuarios"
          description={`${users.length} usuario${users.length !== 1 ? 's' : ''} en tu equipo`}
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
          actions={
            <Button variant="outline" onClick={() => setShowCreateModal(true)}>
              + Nuevo usuario
            </Button>
          }
        />

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        {users.length === 0 && !loading ? (
          <Card shadow="none">
            <EmptyState
              icon={<UsersIcon className="w-8 h-8 text-gray-800" />}
              title="Todavía no hay usuarios"
              description="Creá el primer usuario de tu equipo"
              titleClassName="text-gray-900 text-xl"
              descriptionClassName="text-gray-900 text-base"
            />
          </Card>
        ) : (
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Usuario</TableHeaderCell>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell align="center">Acciones</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.username}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 flex-shrink-0">
                          {(u.nombre || u.username).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="font-medium text-gray-900">{u.username}</span>
                    </div>
                  </TableCell>
                  <TableCell textClassName="text-gray-800">
                    {[u.nombre, u.apellido].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell textClassName="text-gray-800">{u.email || '—'}</TableCell>
                  <TableCell textClassName="text-gray-800 capitalize">
                    {u.role === 'admin' ? 'UsuarioAdmin' : 'Usuario'}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-base font-medium rounded-full ${u.disabled ? 'bg-red-200 text-red-950' : 'bg-green-200 text-green-950'}`}>
                      {u.disabled ? 'Deshabilitado' : 'Activo'}
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={() => openEditUser(u)} className="text-sm text-gray-800 hover:underline">
                        Editar
                      </button>
                      <button onClick={() => handleToggleDisabled(u)} className="text-sm text-gray-800 hover:underline">
                        {u.disabled ? 'Habilitar' : 'Deshabilitar'}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Nuevo usuario</h2>
            <form onSubmit={handleCreateUser}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Usuario *</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Contraseña *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                  minLength={6}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newUser.nombre}
                    onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Apellido</label>
                  <input
                    type="text"
                    value={newUser.apellido}
                    onChange={(e) => setNewUser({ ...newUser, apellido: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Avatar</label>
                <AvatarPicker
                  value={newUser.avatar_url}
                  onChange={(url) => setNewUser({ ...newUser, avatar_url: url })}
                  fallbackLabel={newUser.nombre || newUser.username}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-1">Rol *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as TenantUserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="admin">UsuarioAdmin</option>
                  <option value="operativo">Usuario (operativo)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={creating}>
                  Crear usuario
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Editar {editingUser.username}</h2>
            <form onSubmit={handleSaveEdit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editForm.nombre}
                    onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Apellido</label>
                  <input
                    type="text"
                    value={editForm.apellido}
                    onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Avatar</label>
                <AvatarPicker
                  value={editForm.avatar_url}
                  onChange={(url) => setEditForm({ ...editForm, avatar_url: url })}
                  fallbackLabel={editForm.nombre || editingUser.username}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-1">Rol</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as TenantUserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="admin">UsuarioAdmin</option>
                  <option value="operativo">Usuario (operativo)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={savingEdit}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Users;
