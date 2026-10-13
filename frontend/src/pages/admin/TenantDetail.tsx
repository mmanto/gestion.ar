import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { Field, FORM_CLASSES, ROW_2 } from '../../components/common/FormField';
import { useModules } from '../../modules/ModulesProvider';
import type { ModuleManifest } from '../../modules/manifest';
import { Input } from '../../components/ui/input';
import { AvatarPicker } from '../../components/common/AvatarPicker';
import { DataTable, defineTableDTO, type TableDTO } from '@mmanto/devbout-ui';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';
import tenantAdminService from '../../services/tenantAdmin.service';
import botsService from '../../services/bots.service';
import type {
  Plan,
  Tenant,
  TenantModuleInfo,
  TenantUser,
  TenantUserRole,
} from '../../types/tenant.types';
import type { Bot } from '../../types/bot.types';

const roleLabels: Record<TenantUserRole, string> = {
  admin: 'UsuarioAdmin',
  operativo: 'Usuario',
  broker: 'Broker',
};

const roleOptions: { value: TenantUserRole; label: string }[] = [
  { value: 'admin', label: 'UsuarioAdmin' },
  { value: 'operativo', label: 'Usuario (operativo)' },
  { value: 'broker', label: 'Broker' },
];

const emptyUserForm = {
  username: '',
  password: '',
  email: '',
  nombre: '',
  apellido: '',
  avatar_url: '',
  role: 'operativo' as TenantUserRole,
};

/**
 * Título de sección: mismo criterio que los títulos de los formularios de
 * entidad del paquete (`heading-section` + `font-heading`, ver
 * docs/design/DESIGN.md).
 */
const sectionTitle = 'font-heading heading-section font-medium text-foreground';

export const TenantDetail = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const moduleManifests = useModules();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showUserModal, setShowUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState(emptyUserForm);

  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [editForm, setEditForm] = useState<{
    email: string;
    nombre: string;
    apellido: string;
    avatar_url: string;
    role: TenantUserRole;
  }>({
    email: '',
    nombre: '',
    apellido: '',
    avatar_url: '',
    role: 'operativo',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [tenantModules, setTenantModules] = useState<TenantModuleInfo[]>([]);
  const [modulesUpdating, setModulesUpdating] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [deleting, setDeleting] = useState(false);
  // La zona de peligro arranca oculta: se muestra sólo si el admin la pide.
  const [showDanger, setShowDanger] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [tenantData, usersData, botsData, modulesData, plansData] = await Promise.all([
        tenantAdminService.getTenant(tenantId),
        tenantAdminService.listUsers(tenantId, 1, 100),
        botsService.getBots({ tenant_id: tenantId, limit: 100 }),
        tenantAdminService.getTenantModules(tenantId),
        tenantAdminService.listPlans(),
      ]);
      setTenant(tenantData);
      setUsers(usersData.users);
      setBots(botsData.bots);
      setTenantModules(modulesData);
      setPlans(plansData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando el tenant');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteTenant = async () => {
    if (!tenantId) return;
    if (!confirm(`¿Eliminar el tenant "${tenant?.name || tenantId}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await tenantAdminService.deleteTenant(tenantId);
      window.location.href = '/admin/tenants';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el tenant');
      setDeleting(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || !newUser.username || !newUser.password) return;
    try {
      setCreatingUser(true);
      await tenantAdminService.createUser({
        ...newUser,
        tenant_id: tenantId,
        email: newUser.email || undefined,
        nombre: newUser.nombre || undefined,
        apellido: newUser.apellido || undefined,
        avatar_url: newUser.avatar_url || undefined,
      });
      setShowUserModal(false);
      setNewUser(emptyUserForm);
      load();
    } catch (err) {
      console.error('Error creating user:', err);
    } finally {
      setCreatingUser(false);
    }
  };

  // Estables (`useCallback`) porque alimentan el DTO de la grilla: si cambiaran
  // en cada render, el `useMemo` del DTO se recrearía y la tabla perdería su
  // estado (orden, columnas visibles).
  const handleToggleDisabled = useCallback(
    async (user: TenantUser) => {
      await tenantAdminService.updateUser(user.username, { disabled: !user.disabled });
      load();
    },
    [load],
  );

  // Aprueba (manual) el plan que un usuario pidió al darse de alta por
  // autoregistro/gmail (pending → approved/active). Ver ADR-013.
  const handleApproveUserPlan = useCallback(
    async (username: string, status: 'approved' | 'active') => {
      await tenantAdminService.approveUserPlanRequest(username, status);
      load();
    },
    [load],
  );

  const openEditUser = useCallback((user: TenantUser) => {
    setEditingUser(user);
    setEditForm({
      email: user.email || '',
      nombre: user.nombre || '',
      apellido: user.apellido || '',
      avatar_url: user.avatar_url || '',
      role: (user.role as TenantUserRole) || 'operativo',
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
      });
      setEditingUser(null);
      load();
    } catch (err) {
      console.error('Error updating user:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  // La confirmación la hace la grilla (variante destructiva del DTO).
  const handleDeleteUser = useCallback(
    async (user: TenantUser) => {
      try {
        await tenantAdminService.deleteUser(user.username);
        load();
      } catch {
        // El interceptor de la API ya muestra el motivo (p. ej. bots asociados).
      }
    },
    [load],
  );

  // Módulos del tenant (no por bot): `granted` es lo que administración general
  // otorga; un módulo sin pantallas propias sólo funciona a través del chat, así
  // que un tenant sin agente no lo puede usar todavía.
  const handleGrantTenantModule = useCallback(
    async (moduleKey: string) => {
      if (!tenantId || !moduleKey) return;
      setModulesUpdating(moduleKey);
      try {
        await tenantAdminService.grantTenantModule(tenantId, moduleKey);
        setTenantModules(await tenantAdminService.getTenantModules(tenantId));
      } finally {
        setModulesUpdating(null);
      }
    },
    [tenantId],
  );

  const handleRevokeTenantModule = useCallback(
    async (moduleKey: string) => {
      if (!tenantId) return;
      setModulesUpdating(moduleKey);
      try {
        await tenantAdminService.revokeTenantModule(tenantId, moduleKey);
        setTenantModules(await tenantAdminService.getTenantModules(tenantId));
      } finally {
        setModulesUpdating(null);
      }
    },
    [tenantId],
  );

  // Alta de usuario: sigue en un `Dialog` propio (el schema del paquete no
  // renderiza la contraseña ni el `AvatarPicker`), pero el botón va en el
  // toolbar de la grilla, al lado del buscador.
  const toolbarButton = useMemo(
    () => (
      <Button variant="primary" onClick={() => setShowUserModal(true)}>
        + Nuevo usuario
      </Button>
    ),
    [],
  );

  const modulesByKey = useMemo(() => {
    const map: Record<string, ModuleManifest> = {};
    for (const manifest of moduleManifests) map[manifest.module_key] = manifest;
    return map;
  }, [moduleManifests]);

  const grantableModules = useMemo(
    () =>
      tenantModules
        .filter((module) => !module.granted)
        .map((module) => ({
          value: module.module_key,
          label: module.module_name || module.module_key,
        })),
    [tenantModules],
  );

  const grantedModules = useMemo(
    () => tenantModules.filter((module) => module.granted),
    [tenantModules],
  );

  // Grilla del paquete (mismo `DataTable` que la lista de tenants). Sin
  // `entity`: el alta/edición de usuario las manejan los diálogos de esta
  // pantalla (el schema del paquete no renderiza el `AvatarPicker` ni un campo
  // de contraseña). Los handlers del DTO son estables (`useCallback`).
  const usersDto = useMemo<TableDTO<TenantUser>>(
    () =>
      defineTableDTO<TenantUser>({
        // `toolbarActions` es de @mmanto/devbout-ui 0.4 (changeset
        // `data-table-toolbar-actions`): el 0.3.0 publicado todavía no lo tipa, así
        // que va por un cast. Se cae al actualizar la dependencia
        // (`npm install @mmanto/devbout-ui@^0.4.0`).
        ...({ toolbarActions: toolbarButton } as Partial<TableDTO<TenantUser>>),
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
          status: 'Estado',
          plan: 'Plan',
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
              roleLabels[(row.original.role as TenantUserRole) ?? 'operativo'] ?? row.original.role,
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
          {
            id: 'plan',
            header: 'Plan',
            accessorFn: (u) =>
              plans.find((p) => p.plan_id === u.requested_plan_id)?.name ?? '',
            cell: ({ row }) => {
              const u = row.original;
              if (!u.requested_plan_id) {
                return <span className="text-muted-foreground">—</span>;
              }
              return (
                <div className="flex items-center gap-2">
                  {plans.find((p) => p.plan_id === u.requested_plan_id)?.name ?? 'Plan'}
                  {u.subscription_status === 'pending' && (
                    <>
                      <Badge variant="warning">Pendiente</Badge>
                      <Button
                        variant="link"
                        size="xs"
                        onClick={() => handleApproveUserPlan(u.username, 'active')}
                      >
                        Aprobar
                      </Button>
                    </>
                  )}
                </div>
              );
            },
          },
        ],
        rowActions: [
          { id: 'edit', label: 'Editar', run: openEditUser },
          { id: 'toggle', label: 'Habilitar / deshabilitar', run: handleToggleDisabled },
          { id: 'delete', label: 'Eliminar', variant: 'destructive', run: handleDeleteUser },
        ],
      }),
    [plans, handleApproveUserPlan, handleDeleteUser, handleToggleDisabled, openEditUser, toolbarButton],
  );

  if (loading) return <LoadingPage />;
  if (!tenant)
    return (
      <AppLayout>
        <Alert variant="error">Tenant no encontrado</Alert>
      </AppLayout>
    );

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={tenant.name}
          description={tenant.domain || 'Sin dominio asignado'}
          actions={
            <Link to="/admin/tenants" className="text-xs text-muted-foreground hover:text-foreground">
              ← Volver a Tenants
            </Link>
          }
        />

        {error && <Alert variant="error">Error: {error}</Alert>}

        {/* Usuarios */}
        <section className="grid gap-3">
          <h3 className={sectionTitle}>Usuarios ({users.length})</h3>
          <DataTable dto={usersDto} data={users} />
        </section>

        {/* Módulos del tenant (independientes del agente) */}
        <section className="grid gap-4">
          <h3 className={sectionTitle}>Módulos</h3>
          <div className={FORM_CLASSES}>
            <div className={ROW_2}>
              <Field label="Agregar módulo" htmlFor="tenant-module">
                <Select
                  items={grantableModules}
                  value=""
                  onValueChange={(next) => {
                    if (next) void handleGrantTenantModule(next);
                  }}
                >
                  <SelectTrigger id="tenant-module" className="w-full">
                    <SelectValue placeholder="Elegí un módulo disponible" />
                  </SelectTrigger>
                  <SelectContent>
                    {grantableModules.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4">
              {grantedModules.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Este tenant no tiene módulos otorgados.
                </p>
              ) : (
                grantedModules.map((module) => (
                  <div
                    key={module.module_key}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="grid gap-1">
                      <span className="font-medium text-foreground">
                        {module.module_name || module.module_key}
                      </span>
                      {module.module_description && (
                        <span className="text-xs text-muted-foreground">
                          {module.module_description}
                        </span>
                      )}
                      {bots.length === 0 &&
                        (modulesByKey[module.module_key]?.tenant?.nav?.length ?? 0) === 0 && (
                          <span className="text-xs text-warning">
                            Sin agente queda sin interfaz: este módulo sólo se usa por el chat o
                            dentro de un agente.
                          </span>
                        )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={modulesUpdating === module.module_key}
                      onClick={() => void handleRevokeTenantModule(module.module_key)}
                    >
                      Revocar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Zona de peligro — oculta hasta que se pida verla */}
        <section className="grid gap-3 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn(sectionTitle, 'text-destructive')}>Zona de peligro</h3>
            <Button variant="outline" size="sm" onClick={() => setShowDanger((shown) => !shown)}>
              {showDanger ? 'Ocultar' : 'Mostrar'}
            </Button>
          </div>
          {showDanger && (
            <>
              <p className="text-xs text-muted-foreground">
                Elimina permanentemente el tenant. Requiere que no tenga bots, usuarios, canales,
                clientes ni conversaciones asociados.
              </p>
              <div className="flex">
                <Button variant="destructive" onClick={handleDeleteTenant} loading={deleting}>
                  {deleting ? 'Eliminando...' : 'Eliminar tenant'}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              Crea un usuario del tenant. El acceso se hace con usuario y contraseña.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className={cn(FORM_CLASSES, 'overflow-y-auto')}>
            <div className={ROW_2}>
              <Field label="Usuario" htmlFor="new-user-username">
                <Input
                  id="new-user-username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  required
                  autoComplete="off"
                />
              </Field>
              <Field label="Contraseña" htmlFor="new-user-password">
                <Input
                  id="new-user-password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <div className={ROW_2}>
              <Field label="Email" htmlFor="new-user-email">
                <Input
                  id="new-user-email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </Field>
              <Field label="Rol" htmlFor="new-user-role">
                <Select
                  items={roleOptions}
                  value={newUser.role}
                  onValueChange={(next) =>
                    setNewUser({ ...newUser, role: (next as TenantUserRole) ?? 'operativo' })
                  }
                >
                  <SelectTrigger id="new-user-role" className="w-full">
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
            </div>

            <div className={ROW_2}>
              <Field label="Nombre" htmlFor="new-user-nombre">
                <Input
                  id="new-user-nombre"
                  value={newUser.nombre}
                  onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                />
              </Field>
              <Field label="Apellido" htmlFor="new-user-apellido">
                <Input
                  id="new-user-apellido"
                  value={newUser.apellido}
                  onChange={(e) => setNewUser({ ...newUser, apellido: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Avatar">
              <AvatarPicker
                value={newUser.avatar_url}
                onChange={(url) => setNewUser({ ...newUser, avatar_url: url })}
                fallbackLabel={newUser.nombre || newUser.username}
              />
            </Field>

            <DialogFooter className="flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowUserModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={creatingUser}>
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
              Actualiza los datos del usuario. La contraseña no se cambia desde acá.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className={cn(FORM_CLASSES, 'overflow-y-auto')}>
            <div className={ROW_2}>
              <Field label="Email" htmlFor="edit-user-email">
                <Input
                  id="edit-user-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </Field>
              <Field label="Rol" htmlFor="edit-user-role">
                <Select
                  items={roleOptions}
                  value={editForm.role}
                  onValueChange={(next) =>
                    setEditForm({ ...editForm, role: (next as TenantUserRole) ?? 'operativo' })
                  }
                >
                  <SelectTrigger id="edit-user-role" className="w-full">
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
            </div>

            <div className={ROW_2}>
              <Field label="Nombre" htmlFor="edit-user-nombre">
                <Input
                  id="edit-user-nombre"
                  value={editForm.nombre}
                  onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                />
              </Field>
              <Field label="Apellido" htmlFor="edit-user-apellido">
                <Input
                  id="edit-user-apellido"
                  value={editForm.apellido}
                  onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Avatar">
              <AvatarPicker
                value={editForm.avatar_url}
                onChange={(url) => setEditForm({ ...editForm, avatar_url: url })}
                fallbackLabel={editForm.nombre || editingUser?.username || ''}
              />
            </Field>

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

export default TenantDetail;
