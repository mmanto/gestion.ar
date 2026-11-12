import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { DataTable, defineTableDTO, type TableDTO } from '@mmanto/devbout-ui';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { AvatarPicker } from '../../components/common/AvatarPicker';
import { Input } from '../../components/ui/input';
import { FORM_CLASSES, FormGrid, Field } from '../../components/common/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import tenantAdminService from '../../services/tenantAdmin.service';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type { AdminUserRole, Tenant, TenantUser } from '../../types/tenant.types';

const roleLabels: Record<AdminUserRole, string> = {
  super_admin: 'Administración general',
  admin: 'UsuarioAdmin',
  operativo: 'Usuario',
  broker: 'Broker',
  partner: 'Partner',
};

const roleOptions: { value: AdminUserRole; label: string }[] = (
  Object.keys(roleLabels) as AdminUserRole[]
).map((role) => ({ value: role, label: roleLabels[role] }));

const emptyCreateForm = {
  username: '',
  password: '',
  email: '',
  nombre: '',
  apellido: '',
  avatar_url: '',
  role: 'admin' as AdminUserRole,
  tenant_id: '',
};

/**
 * ABM global de usuarios del backoffice principal (`/admin/users`).
 *
 * A diferencia de la grilla de usuarios de `TenantEdit` (scoped a un tenant y
 * dueña del flujo de plan), esta pantalla lista y administra las cuentas de
 * toda la plataforma: es donde se crean los `super_admin` (sin tenant) y los
 * usuarios de cualquier tenant, con su rol y estado.
 *
 * El tenant de un usuario no se puede cambiar: el rol está atado a la
 * existencia de tenant (`ck_users_role_tenant_consistency`) y mover una cuenta
 * rompería sus agentes/clientes. Para eso se crea el usuario en el tenant
 * correcto.
 */
export const Users = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<TenantUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);

  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    email: '',
    nombre: '',
    apellido: '',
    avatar_url: '',
    role: 'operativo' as AdminUserRole,
    password: '',
  });

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
      const [usersData, tenantsData] = await Promise.all([
        tenantAdminService.listUsers(undefined, 1, 200),
        tenantAdminService.listTenants(1, 100),
      ]);
      setUsers(usersData.users);
      setTenants(tenantsData.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando usuarios');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tenantNameById = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const tenant of tenants) byId[tenant.tenant_id] = tenant.name;
    return byId;
  }, [tenants]);

  const tenantOptions = useMemo(
    () => tenants.map((tenant) => ({ value: tenant.tenant_id, label: tenant.name })),
    [tenants],
  );

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.username || !createForm.password) return;
    if (createForm.role !== 'super_admin' && !createForm.tenant_id) {
      showToast('Elegí el tenant del usuario', 'error');
      return;
    }
    try {
      setCreating(true);
      await tenantAdminService.createUser({
        username: createForm.username,
        password: createForm.password,
        email: createForm.email || undefined,
        nombre: createForm.nombre || undefined,
        apellido: createForm.apellido || undefined,
        avatar_url: createForm.avatar_url || undefined,
        role: createForm.role,
        // El super_admin es el único rol sin tenant (ver ADR-041).
        tenant_id: createForm.role === 'super_admin' ? undefined : createForm.tenant_id,
      });
      setShowCreate(false);
      setCreateForm(emptyCreateForm);
      await load({ silent: true });
      showToast('Usuario creado', 'success');
    } catch (err) {
      // El interceptor de la API ya muestra el motivo (username repetido, etc.).
      console.error('Error creando usuario:', err);
    } finally {
      setCreating(false);
    }
  };

  const openEditUser = useCallback((target: TenantUser) => {
    setEditingUser(target);
    setEditForm({
      email: target.email || '',
      nombre: target.nombre || '',
      apellido: target.apellido || '',
      avatar_url: target.avatar_url || '',
      role: (target.role as AdminUserRole) || 'operativo',
      password: '',
    });
  }, []);

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      setSavingEdit(true);
      await tenantAdminService.updateUser(editingUser.username, {
        email: editForm.email || undefined,
        nombre: editForm.nombre || undefined,
        apellido: editForm.apellido || undefined,
        avatar_url: editForm.avatar_url || undefined,
        role: editForm.role,
        // Vacío = conservar la contraseña actual (el backend sólo hashea si viene).
        password: editForm.password || undefined,
      });
      setEditingUser(null);
      await load({ silent: true });
      showToast('Usuario actualizado', 'success');
    } catch (err) {
      console.error('Error actualizando usuario:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleDisabled = useCallback(
    async (target: TenantUser) => {
      if (target.username === currentUser?.username) {
        showToast('No podés deshabilitar tu propia cuenta.', 'error');
        return;
      }
      try {
        await tenantAdminService.updateUser(target.username, { disabled: !target.disabled });
        await load({ silent: true });
      } catch {
        // El interceptor de la API ya muestra el motivo.
      }
    },
    [currentUser?.username, load, showToast],
  );

  const handleDeleteUser = useCallback(
    async (target: TenantUser) => {
      if (target.username === currentUser?.username) {
        showToast('No podés eliminar tu propia cuenta.', 'error');
        return;
      }
      try {
        await tenantAdminService.deleteUser(target.username);
        await load({ silent: true });
      } catch {
        // El interceptor de la API ya muestra el motivo (p. ej. agentes asociados).
      }
    },
    [currentUser?.username, load, showToast],
  );

  const toolbarButton = useMemo(
    () => (
      <Button
        onClick={() => {
          setCreateForm(emptyCreateForm);
          setShowCreate(true);
        }}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        Nuevo usuario
      </Button>
    ),
    [],
  );

  const dto = useMemo<TableDTO<TenantUser>>(
    () =>
      defineTableDTO<TenantUser>({
        toolbarActions: toolbarButton,
        header: (rows) => (
          <PageHeader
            title="Usuarios"
            description={`${rows.length} usuario${rows.length !== 1 ? 's' : ''} en total`}
          />
        ),
        selectable: false,
        onDataChange: setUsers,
        search: { columnId: 'username', placeholder: 'Buscar usuario' },
        confirm: {
          title: 'Eliminar usuario',
          message: () => 'El usuario se elimina definitivamente. No se puede deshacer.',
          confirmLabel: 'Eliminar',
          cancelLabel: 'Cancelar',
        },
        columnLabels: {
          username: 'Usuario',
          name: 'Nombre',
          email: 'Email',
          role: 'Rol',
          tenant: 'Tenant',
          status: 'Estado',
        },
        labels: {
          searchAction: 'Buscar',
          rowsPerPage: 'Filas por página',
          columns: 'Columnas',
          noResults: 'Sin usuarios todavía.',
          previous: 'Anterior',
          next: 'Siguiente',
          openRowMenu: 'Abrir acciones de la fila',
        },
        columns: [
          {
            id: 'username',
            accessorKey: 'username',
            header: 'Usuario',
            cell: ({ row }) => (
              <div className="flex items-center gap-2">
                {row.original.avatar_url ? (
                  <img
                    src={row.original.avatar_url}
                    alt=""
                    className="size-6 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                    {(row.original.nombre || row.original.username).charAt(0).toUpperCase()}
                  </span>
                )}
                {row.original.username}
              </div>
            ),
          },
          {
            id: 'name',
            header: 'Nombre',
            accessorFn: (u) => [u.nombre, u.apellido].filter(Boolean).join(' '),
            cell: ({ row }) =>
              [row.original.nombre, row.original.apellido].filter(Boolean).join(' ') || '—',
          },
          {
            id: 'email',
            accessorKey: 'email',
            header: 'Email',
            cell: ({ row }) => row.original.email || '—',
          },
          {
            id: 'role',
            header: 'Rol',
            accessorKey: 'role',
            cell: ({ row }) =>
              roleLabels[(row.original.role as AdminUserRole) ?? 'operativo'] ?? row.original.role,
          },
          {
            id: 'tenant',
            header: 'Tenant',
            accessorFn: (u) => (u.tenant_id ? (tenantNameById[u.tenant_id] ?? '') : ''),
            cell: ({ row }) => {
              const tenantId = row.original.tenant_id;
              if (!tenantId) {
                return <span className="text-muted-foreground">Sin tenant</span>;
              }
              return (
                <Link
                  to={`/admin/tenants/${tenantId}/editar`}
                  className="text-foreground hover:underline"
                >
                  {tenantNameById[tenantId] ?? tenantId}
                </Link>
              );
            },
          },
          {
            id: 'status',
            header: 'Estado',
            accessorFn: (u) => (u.disabled ? 'Deshabilitado' : 'Activo'),
            cell: ({ row }) => (
              <Badge variant={row.original.disabled ? 'destructive' : 'success'}>
                {row.original.disabled ? 'Deshabilitado' : 'Activo'}
              </Badge>
            ),
          },
        ],
        rowActions: [
          { id: 'edit', label: 'Editar', run: openEditUser },
          { id: 'toggle', label: 'Habilitar / deshabilitar', run: handleToggleDisabled },
          { id: 'delete', label: 'Eliminar', variant: 'destructive', run: handleDeleteUser },
        ],
      }),
    [tenantNameById, handleDeleteUser, handleToggleDisabled, openEditUser, toolbarButton],
  );

  if (loading) return <LoadingPage />;

  // Un usuario con tenant no puede pasar a super_admin (y viceversa): el rol
  // está atado a la existencia de tenant.
  const editingHasTenant = Boolean(editingUser?.tenant_id);

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">Error: {error}</Alert>}

        <DataTable dto={dto} data={users} />
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              Crea una cuenta de la plataforma. Los roles de tenant necesitan un tenant asignado;
              administración general no pertenece a ninguno.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className={cn(FORM_CLASSES, 'overflow-y-auto')}>
            <FormGrid>
              <Field label="Usuario" htmlFor="new-global-user-username">
                <Input
                  id="new-global-user-username"
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  required
                  autoComplete="off"
                />
              </Field>
              <Field label="Contraseña" htmlFor="new-global-user-password">
                <Input
                  id="new-global-user-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Rol" htmlFor="new-global-user-role">
                <Select
                  items={roleOptions}
                  value={createForm.role}
                  onValueChange={(next) =>
                    setCreateForm({ ...createForm, role: (next as AdminUserRole) ?? 'admin' })
                  }
                >
                  <SelectTrigger id="new-global-user-role" className="w-full">
                    <SelectValue placeholder="Elegí un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {createForm.role !== 'super_admin' && (
                <Field
                  label="Tenant"
                  htmlFor="new-global-user-tenant"
                  hint="El rol vive dentro de este tenant."
                  reserveHint
                >
                  <Select
                    items={tenantOptions}
                    value={createForm.tenant_id}
                    onValueChange={(next) => setCreateForm({ ...createForm, tenant_id: next ?? '' })}
                  >
                    <SelectTrigger id="new-global-user-tenant" className="w-full">
                      <SelectValue placeholder="Elegí un tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Email" htmlFor="new-global-user-email">
                <Input
                  id="new-global-user-email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </Field>
              <Field label="Nombre" htmlFor="new-global-user-nombre">
                <Input
                  id="new-global-user-nombre"
                  value={createForm.nombre}
                  onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })}
                />
              </Field>
              <Field label="Apellido" htmlFor="new-global-user-apellido">
                <Input
                  id="new-global-user-apellido"
                  value={createForm.apellido}
                  onChange={(e) => setCreateForm({ ...createForm, apellido: e.target.value })}
                />
              </Field>
              <Field label="Avatar">
                <AvatarPicker
                  value={createForm.avatar_url}
                  onChange={(url) => setCreateForm({ ...createForm, avatar_url: url })}
                  fallbackLabel={createForm.nombre || createForm.username}
                />
              </Field>
            </FormGrid>

            <DialogFooter className="flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={creating}>
                Crear usuario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingUser !== null} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar {editingUser?.username}</DialogTitle>
            <DialogDescription>
              Actualiza los datos del usuario. Dejá la contraseña vacía para conservar la actual.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className={cn(FORM_CLASSES, 'overflow-y-auto')}>
            <FormGrid>
              <Field label="Email" htmlFor="edit-global-user-email">
                <Input
                  id="edit-global-user-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </Field>
              <Field
                label="Contraseña"
                htmlFor="edit-global-user-password"
                hint="Dejala vacía para conservar la actual."
                reserveHint
              >
                <Input
                  id="edit-global-user-password"
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Nueva contraseña"
                />
              </Field>
              <Field label="Rol" htmlFor="edit-global-user-role">
                <Select
                  items={roleOptions}
                  value={editForm.role}
                  onValueChange={(next) =>
                    setEditForm({ ...editForm, role: (next as AdminUserRole) ?? 'operativo' })
                  }
                  disabled={!editingHasTenant}
                >
                  <SelectTrigger id="edit-global-user-role" className="w-full">
                    <SelectValue placeholder="Elegí un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        // El rol está atado al tenant: no se puede promover un
                        // usuario de tenant a super_admin ni degradar a éste.
                        disabled={
                          editingHasTenant
                            ? option.value === 'super_admin'
                            : option.value !== 'super_admin'
                        }
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tenant">
                <div className="flex h-7 items-center">
                  {editingHasTenant ? (
                    <span className="text-sm text-foreground">
                      {tenantNameById[editingUser?.tenant_id ?? ''] ?? editingUser?.tenant_id}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Sin tenant</span>
                  )}
                </div>
              </Field>
              <Field label="Nombre" htmlFor="edit-global-user-nombre">
                <Input
                  id="edit-global-user-nombre"
                  value={editForm.nombre}
                  onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                />
              </Field>
              <Field label="Apellido" htmlFor="edit-global-user-apellido">
                <Input
                  id="edit-global-user-apellido"
                  value={editForm.apellido}
                  onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })}
                />
              </Field>
              <Field label="Avatar">
                <AvatarPicker
                  value={editForm.avatar_url}
                  onChange={(url) => setEditForm({ ...editForm, avatar_url: url })}
                  fallbackLabel={editForm.nombre || editingUser?.username || ''}
                />
              </Field>
            </FormGrid>

            <DialogFooter className="flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button type="submit" loading={savingEdit}>
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Users;
