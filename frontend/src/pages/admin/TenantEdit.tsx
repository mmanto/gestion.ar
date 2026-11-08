import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { AvatarPicker } from '../../components/common/AvatarPicker';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { FORM_CLASSES, FormGrid, Field } from '../../components/common/FormField';
import {
  Button as UiButton,
  DataTable,
  defineTableDTO,
  type TableDTO,
} from '@mmanto/devbout-ui';
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
import botsService from '../../services/bots.service';
import { useToast } from '../../hooks/useToast';
import type {
  ModuleInfo,
  Plan,
  Tenant,
  TenantStatus,
  TenantUser,
  TenantUserRole,
} from '../../types/tenant.types';
import type { Bot, BotStatus } from '../../types/bot.types';

const statusLabels: Record<TenantStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  trial: 'Prueba',
};

const statusOptions = (Object.keys(statusLabels) as TenantStatus[]).map((s) => ({
  value: s,
  label: statusLabels[s],
}));

const roleLabels: Record<TenantUserRole, string> = {
  admin: 'UsuarioAdmin',
  operativo: 'Usuario',
  broker: 'Broker',
};

const botStatusLabels: Record<BotStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  maintenance: 'Mantenimiento',
};

const botStatusVariants: Record<BotStatus, 'success' | 'secondary' | 'warning'> = {
  active: 'success',
  inactive: 'secondary',
  maintenance: 'warning',
};

const roleOptions: { value: TenantUserRole; label: string }[] = [
  { value: 'admin', label: 'UsuarioAdmin' },
  { value: 'operativo', label: 'Usuario (operativo)' },
  { value: 'broker', label: 'Broker' },
];

const emptyBotForm = { name: '', business_type: '', description: '' };

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

/**
 * Pantalla única de administración de un tenant (`/admin/tenants/:id/editar`):
 * datos generales y marca, agente asignado y usuarios, más la zona de peligro.
 * Los módulos se administran en el agente, no acá. Es la superficie de edición
 * de la entidad (`edit.href` en
 * `Tenants.tsx`) y absorbe la que antes era la pantalla de detalle
 * («Gestionar usuarios y módulos»), ya que el schema del paquete no puede
 * renderizar el uploader de los logos. El alta sigue usando el formulario del
 * paquete: la marca y el resto se cargan después de crear el tenant.
 */
export const TenantEdit = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // La zona de peligro arranca oculta: se muestra sólo si el admin la pide.
  const [showDanger, setShowDanger] = useState(false);

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<TenantStatus>('trial');
  const [planId, setPlanId] = useState('');

  const [logoH, setLogoH] = useState<string | undefined>();
  const [logoV, setLogoV] = useState<string | undefined>();
  const [color, setColor] = useState('#25357a');
  const [tagline, setTagline] = useState('');

  const [showBotModal, setShowBotModal] = useState(false);
  const [creatingBot, setCreatingBot] = useState(false);
  const [newBot, setNewBot] = useState(emptyBotForm);
  const [botModules, setBotModules] = useState<ModuleInfo[]>([]);
  const [selectedBotModules, setSelectedBotModules] = useState<string[]>([]);

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
    password: string;
  }>({
    email: '',
    nombre: '',
    apellido: '',
    avatar_url: '',
    role: 'operativo',
    password: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  /** Vuelca el tenant en el formulario de datos generales y marca. */
  const applyTenant = useCallback((data: Tenant) => {
    setTenant(data);
    setName(data.name);
    setDomain(data.domain || '');
    setStatus(data.status);
    setPlanId(data.plan_id);
    setLogoH(data.branding?.logo_url_horizontal || data.branding?.logo_url || undefined);
    setLogoV(data.branding?.logo_url_vertical || undefined);
    setColor(data.branding?.primary_color || '#25357a');
    setTagline(data.branding?.tagline || '');
  }, []);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [tenantData, plansData, usersData, botsData] = await Promise.all([
        tenantAdminService.getTenant(tenantId),
        tenantAdminService.listPlans(),
        tenantAdminService.listUsers(tenantId, 1, 100),
        botsService.getBots({ tenant_id: tenantId, limit: 100 }),
      ]);
      applyTenant(tenantData);
      setPlans(plansData);
      setUsers(usersData.users);
      setBots(botsData.bots);
      // Catálogo para el alta de agentes: si falla, la pantalla sigue usable.
      tenantAdminService
        .listModules()
        .then(setBotModules)
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando el tenant');
    } finally {
      setLoading(false);
    }
  }, [tenantId, applyTenant]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadUsers = useCallback(async () => {
    if (!tenantId) return;
    const usersData = await tenantAdminService.listUsers(tenantId, 1, 100);
    setUsers(usersData.users);
  }, [tenantId]);

  const reloadBots = useCallback(async () => {
    if (!tenantId) return;
    const botsData = await botsService.getBots({ tenant_id: tenantId, limit: 100 });
    setBots(botsData.bots);
  }, [tenantId]);

  const toggleBotModule = (moduleKey: string) => {
    setSelectedBotModules((prev) =>
      prev.includes(moduleKey) ? prev.filter((key) => key !== moduleKey) : [...prev, moduleKey],
    );
  };

  const handleCreateBot = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || !newBot.name.trim() || !newBot.business_type.trim()) return;
    try {
      setCreatingBot(true);
      await botsService.createBot({
        tenant_id: tenantId,
        name: newBot.name.trim(),
        business_type: newBot.business_type.trim(),
        description: newBot.description.trim() || undefined,
        module_keys: selectedBotModules,
      });
      setShowBotModal(false);
      setNewBot(emptyBotForm);
      setSelectedBotModules([]);
      await reloadBots();
      showToast('Agente creado', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el agente');
    } finally {
      setCreatingBot(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || !tenant) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await tenantAdminService.updateTenant(tenantId, {
        name: name.trim(),
        domain: domain.trim() || undefined,
        status,
        plan_id: planId,
        // El backend reemplaza el dict completo de `branding`: se preservan las
        // claves que esta pantalla no edita (p. ej. el `logo_url` legacy o
        // `sidebar_visible` que siguen en los datos de algunos tenants).
        branding: {
          ...(tenant.branding ?? {}),
          logo_url_horizontal: logoH || undefined,
          logo_url_vertical: logoV || undefined,
          primary_color: color,
          tagline: tagline || undefined,
        },
      });
      applyTenant(updated);
      showToast('Cambios guardados', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el tenant');
    } finally {
      setSaving(false);
    }
  };

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
      await reloadUsers();
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
      try {
        await tenantAdminService.updateUser(user.username, { disabled: !user.disabled });
        await reloadUsers();
      } catch {
        // El interceptor de la API ya muestra el motivo.
      }
    },
    [reloadUsers],
  );

  // Aprueba (manual) el plan que un usuario pidió al darse de alta por
  // autoregistro/gmail (pending → approved/active). Ver ADR-013.
  const handleApproveUserPlan = useCallback(
    async (username: string, status: 'approved' | 'active') => {
      try {
        await tenantAdminService.approveUserPlanRequest(username, status);
        await reloadUsers();
      } catch {
        // El interceptor de la API ya muestra el motivo.
      }
    },
    [reloadUsers],
  );

  const openEditUser = useCallback((user: TenantUser) => {
    setEditingUser(user);
    setEditForm({
      email: user.email || '',
      nombre: user.nombre || '',
      apellido: user.apellido || '',
      avatar_url: user.avatar_url || '',
      role: (user.role as TenantUserRole) || 'operativo',
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
      await reloadUsers();
      showToast('Usuario actualizado', 'success');
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
        await reloadUsers();
      } catch {
        // El interceptor de la API ya muestra el motivo (p. ej. bots asociados).
      }
    },
    [reloadUsers],
  );

  // Alta de usuario: el botón lo renderiza el toolbar del `DataTable`
  // (`toolbarActions`) con la misma primitiva y forma que el alta de entidad,
  // así ambas grillas heredan el mismo toolbar. El formulario sigue en un
  // `Dialog` propio porque el schema no cubre contraseña ni `AvatarPicker`.
  const toolbarButton = useMemo(
    () => (
      <UiButton onClick={() => setShowUserModal(true)}>
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        Nuevo usuario
      </UiButton>
    ),
    [],
  );

  const usersDto = useMemo<TableDTO<TenantUser>>(
    () =>
      defineTableDTO<TenantUser>({
        toolbarActions: toolbarButton,
        // Cabecera dentro del DataTable (título + contador) para heredar su layout.
        header: (rows) => (
          <h3 className={sectionTitle}>Usuarios ({rows.length})</h3>
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

  // Alta de agentes: mismo patrón que la grilla de usuarios. El tenant está
  // fijado por la pantalla; el alta se puede repetir para sumar más agentes.
  const botToolbarButton = useMemo(
    () => (
      <UiButton onClick={() => setShowBotModal(true)}>
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        Nuevo agente
      </UiButton>
    ),
    [],
  );

  const botsDto = useMemo<TableDTO<Bot>>(
    () =>
      defineTableDTO<Bot>({
        toolbarActions: botToolbarButton,
        header: (rows) => (
          <h3 className={sectionTitle}>Agentes ({rows.length})</h3>
        ),
        selectable: false,
        onDataChange: setBots,
        search: { columnId: 'name', placeholder: 'Buscar agente' },
        columnLabels: {
          name: 'Agente',
          status: 'Estado',
          business_type: 'Tipo de negocio',
        },
        labels: {
          searchAction: 'Buscar',
          rowsPerPage: 'Filas por página',
          columns: 'Columnas',
          noResults: 'Sin agentes todavía.',
          previous: 'Anterior',
          next: 'Siguiente',
          openRowMenu: 'Abrir acciones de la fila',
        },
        columns: [
          {
            id: 'name',
            accessorKey: 'name',
            header: 'Agente',
            cell: ({ row }) => (
              <div className="grid">
                <Link
                  to={`/bots/${row.original.bot_id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {row.original.name}
                </Link>
                {row.original.description && (
                  <span className="text-xs text-muted-foreground">
                    {row.original.description}
                  </span>
                )}
              </div>
            ),
          },
          {
            id: 'status',
            header: 'Estado',
            cell: ({ row }) => (
              <Badge variant={botStatusVariants[row.original.status]}>
                {botStatusLabels[row.original.status]}
              </Badge>
            ),
          },
          {
            id: 'business_type',
            accessorKey: 'business_type',
            header: 'Tipo de negocio',
          },
        ],
        rowActions: [
          {
            id: 'open',
            label: 'Abrir configuración',
            run: (bot) => navigate(`/bots/${bot.bot_id}`),
          },
        ],
      }),
    [navigate, botToolbarButton],
  );

  if (loading) return <LoadingPage />;
  if (!tenant)
    return (
      <AppLayout>
        <Alert variant="error">Tenant no encontrado</Alert>
      </AppLayout>
    );

  const planItems = plans.map((p) => ({
    value: p.plan_id,
    label: `${p.name} — $${p.amount.toLocaleString('es-AR')}/${p.periodicity === 'monthly' ? 'mes' : 'año'}`,
  }));

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <nav>
          <ol className="flex items-center gap-2 text-xs text-muted-foreground">
            <li>
              <Link to="/admin/tenants" className="hover:text-foreground">
                Tenants
              </Link>
            </li>
            <li>/</li>
            <li className="text-foreground">{tenant.name}</li>
          </ol>
        </nav>

        <PageHeader
          title={`Editar ${tenant.name}`}
          description="Datos generales y marca, agente y usuarios del tenant"
        />

        {error && <Alert variant="error">Error: {error}</Alert>}

        {/* Datos generales y marca */}
        <form onSubmit={handleSubmit} className={FORM_CLASSES}>
          <h3 className={sectionTitle}>Datos generales y marca</h3>
          <FormGrid>
            <Field label="Nombre" htmlFor="edit-tenant-name" reserveHint>
              <Input
                id="edit-tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            <Field
              label="Dominio propio"
              htmlFor="edit-tenant-domain"
              hint="Dominio propio del tenant (ej. pachoteayuda.ar) — no un subdominio de intellify.pro."
              reserveHint
            >
              <Input
                id="edit-tenant-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ej. pachoteayuda.ar"
              />
            </Field>
            <Field label="Estado" htmlFor="edit-tenant-status" reserveHint>
              <Select
                items={statusOptions}
                value={status}
                onValueChange={(next) => setStatus((next as TenantStatus) ?? 'trial')}
              >
                <SelectTrigger id="edit-tenant-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Plan" htmlFor="edit-tenant-plan">
              <Select items={planItems} value={planId} onValueChange={(next) => setPlanId(next ?? '')}>
                <SelectTrigger id="edit-tenant-plan" className="w-full">
                  <SelectValue placeholder="Elegí un plan" />
                </SelectTrigger>
                <SelectContent>
                  {planItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {/* `wide`: ocupa las dos columnas libres a la derecha de Plan, así
                los logos y el color quedan juntos en la última fila. */}
            <Field label="Tagline" htmlFor="edit-tenant-tagline" wide>
              <Input
                id="edit-tenant-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={200}
                placeholder="Ej: Abogados de confianza"
              />
            </Field>
          </FormGrid>

          {/* Identidad visual: última fila, con un tinte muy tenue del primario. */}
          <div className="rounded-xl bg-primary/5 p-4">
            <FormGrid>
              <Field label="Logo horizontal">
                <AvatarPicker
                  value={logoH}
                  onChange={setLogoH}
                  fallbackLabel={tenant.name.charAt(0) || '?'}
                />
              </Field>
              <Field label="Logo vertical">
                <AvatarPicker
                  value={logoV}
                  onChange={setLogoV}
                  fallbackLabel={tenant.name.charAt(0) || '?'}
                />
              </Field>
              <Field label="Color principal">
                <div className="flex h-7 items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-7 w-10 cursor-pointer rounded-sm border border-input p-0.5"
                  />
                  <span className="font-mono text-xs text-muted-foreground">{color}</span>
                </div>
              </Field>
            </FormGrid>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/admin/tenants')}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>

        {/* Agentes del tenant: grilla canónica con alta propia */}
        <section className="grid gap-3">
          <DataTable dto={botsDto} data={bots} />
        </section>

        {/* Usuarios */}
        <section className="grid gap-3">
          <DataTable dto={usersDto} data={users} />
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
            <FormGrid>
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
            <Field label="Avatar">
              <AvatarPicker
                value={newUser.avatar_url}
                onChange={(url) => setNewUser({ ...newUser, avatar_url: url })}
                fallbackLabel={newUser.nombre || newUser.username}
              />
            </Field>
            </FormGrid>

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
              Actualiza los datos del usuario. Dejá la contraseña vacía para conservar la actual.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className={cn(FORM_CLASSES, 'overflow-y-auto')}>
            <FormGrid>
              <Field label="Email" htmlFor="edit-user-email">
                <Input
                  id="edit-user-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </Field>
              <Field
                label="Contraseña"
                htmlFor="edit-user-password"
                hint="Dejala vacía para conservar la actual."
                reserveHint
              >
                <Input
                  id="edit-user-password"
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Nueva contraseña"
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

      <Dialog open={showBotModal} onOpenChange={setShowBotModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo agente</DialogTitle>
            <DialogDescription>
              Crea un agente de este tenant. Podés repetir el alta para sumar más agentes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBot} className={cn(FORM_CLASSES, 'overflow-y-auto')}>
            <FormGrid>
              <Field label="Nombre del agente" htmlFor="new-bot-name">
                <Input
                  id="new-bot-name"
                  value={newBot.name}
                  onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                  placeholder="Ej: Asistente IUS"
                  required
                />
              </Field>
              <Field label="Tipo de negocio" htmlFor="new-bot-business-type">
                <Input
                  id="new-bot-business-type"
                  value={newBot.business_type}
                  onChange={(e) => setNewBot({ ...newBot, business_type: e.target.value })}
                  placeholder="Ej: legal, restaurante, clínica"
                  required
                />
              </Field>
              <Field label="Descripción" htmlFor="new-bot-description" wide>
                <Textarea
                  id="new-bot-description"
                  value={newBot.description}
                  onChange={(e) => setNewBot({ ...newBot, description: e.target.value })}
                  placeholder="Descripción opcional del agente"
                  rows={3}
                />
              </Field>
            </FormGrid>

            {botModules.length > 0 && (
              <div className="grid gap-2">
                <span className="text-xs font-medium">Módulos a otorgar</span>
                <div className="grid gap-2">
                  {botModules.map((module) => (
                    <label
                      key={module.module_key}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 accent-primary"
                        checked={selectedBotModules.includes(module.module_key)}
                        onChange={() => toggleBotModule(module.module_key)}
                      />
                      <span>
                        {module.name}
                        {module.description && (
                          <span className="block text-xs text-muted-foreground">
                            {module.description}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  El tenant sólo podrá habilitar/deshabilitar los módulos otorgados acá.
                </p>
              </div>
            )}

            <DialogFooter className="flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowBotModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={creatingBot}>
                Crear agente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default TenantEdit;
