import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { AvatarPicker } from '../../components/common/AvatarPicker';
import tenantAdminService from '../../services/tenantAdmin.service';
import botsService from '../../services/bots.service';
import type { Plan, Tenant, TenantStatus, TenantUser, TenantUserRole, BotModuleInfo, ModuleInfo } from '../../types/tenant.types';
import type { Bot } from '../../types/bot.types';

const statusLabels: Record<TenantStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  trial: 'Prueba',
};

export const TenantDetail = () => {
  const { tenantId } = useParams<{ tenantId: string }>();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showUserModal, setShowUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState<{
    username: string; password: string; email: string; nombre: string; apellido: string; avatar_url: string; role: TenantUserRole;
  }>({
    username: '', password: '', email: '', nombre: '', apellido: '', avatar_url: '', role: 'operativo',
  });

  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; nombre: string; apellido: string; avatar_url: string; role: TenantUserRole }>({
    email: '', nombre: '', apellido: '', avatar_url: '', role: 'operativo',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [expandedBotId, setExpandedBotId] = useState<string | null>(null);
  const [botModules, setBotModules] = useState<Record<string, BotModuleInfo[]>>({});
  const [allModules, setAllModules] = useState<ModuleInfo[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | undefined>();
  const [brandingColor, setBrandingColor] = useState('#25357a');
  const [brandingTagline, setBrandingTagline] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [tenantData, usersData, botsData, modulesData, plansData] = await Promise.all([
        tenantAdminService.getTenant(tenantId),
        tenantAdminService.listUsers(tenantId, 1, 100),
        botsService.getBots({ tenant_id: tenantId, limit: 100 }),
        tenantAdminService.listModules(),
        tenantAdminService.listPlans(),
      ]);
      setTenant(tenantData);
      setBrandingLogoUrl(tenantData.branding?.logo_url || undefined);
      setBrandingColor(tenantData.branding?.primary_color || '#25357a');
      setBrandingTagline(tenantData.branding?.tagline || '');
      setUsers(usersData.users);
      setBots(botsData.bots);
      setAllModules(modulesData);
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

  const handleStatusChange = async (status: TenantStatus) => {
    if (!tenantId) return;
    const updated = await tenantAdminService.updateTenant(tenantId, { status });
    setTenant(updated);
  };

  const handlePlanChange = async (planId: string) => {
    if (!tenantId) return;
    const updated = await tenantAdminService.updateTenant(tenantId, { plan_id: planId });
    setTenant(updated);
  };

  const handleSaveBranding = async () => {
    if (!tenantId) return;
    setSavingBranding(true);
    try {
      const updated = await tenantAdminService.updateTenant(tenantId, {
        branding: {
          logo_url: brandingLogoUrl || undefined,
          primary_color: brandingColor,
          tagline: brandingTagline || undefined,
        },
      });
      setTenant(updated);
      setBrandingLogoUrl(updated.branding?.logo_url || undefined);
      setBrandingColor(updated.branding?.primary_color || '#25357a');
      setBrandingTagline(updated.branding?.tagline || '');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
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
      setNewUser({ username: '', password: '', email: '', nombre: '', apellido: '', avatar_url: '', role: 'operativo' });
      load();
    } catch (err) {
      console.error('Error creating user:', err);
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleDisabled = async (user: TenantUser) => {
    await tenantAdminService.updateUser(user.username, { disabled: !user.disabled });
    load();
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

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`¿Eliminar al usuario ${username}?`)) return;
    try {
      await tenantAdminService.deleteUser(username);
      load();
    } catch {
      alert('No se pudo eliminar: puede tener bots asociados.');
    }
  };

  const toggleBotModules = async (botId: string) => {
    if (expandedBotId === botId) {
      setExpandedBotId(null);
      return;
    }
    setExpandedBotId(botId);
    if (!botModules[botId]) {
      const modules = await tenantAdminService.getBotModules(botId);
      setBotModules((prev) => ({ ...prev, [botId]: modules }));
    }
  };

  const handleGrantToggle = async (botId: string, moduleKey: string, currentlyGranted: boolean) => {
    if (currentlyGranted) {
      await tenantAdminService.revokeModule(botId, moduleKey);
    } else {
      await tenantAdminService.grantModule(botId, moduleKey);
    }
    const modules = await tenantAdminService.getBotModules(botId);
    setBotModules((prev) => ({ ...prev, [botId]: modules }));
  };

  if (loading) return <LoadingPage />;
  if (!tenant) return <AppLayout><Alert variant="error">Tenant no encontrado</Alert></AppLayout>;

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title={tenant.name}
          description={tenant.domain || 'Sin dominio asignado'}
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
          actions={
            <Link to="/admin/tenants" className="text-sm text-gray-800 hover:underline">
              ← Volver a Tenants
            </Link>
          }
        />

        {error && <Alert variant="error" className="mb-6">Error: {error}</Alert>}

        {/* Estado del tenant */}
        <Card shadow="none" className="mb-8">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Estado</h3>
          <div className="flex gap-2">
            {(['active', 'trial', 'suspended'] as TenantStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                  tenant.status === s
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {statusLabels[s]}
              </button>
            ))}
          </div>
        </Card>

        {/* Plan */}
        <Card shadow="none" className="mb-8">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Plan</h3>
          <select
            value={tenant.plan_id}
            onChange={(e) => handlePlanChange(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg"
          >
            {plans.map((p) => (
              <option key={p.plan_id} value={p.plan_id}>
                {p.name} — ${p.amount.toLocaleString('es-AR')}/{p.periodicity === 'monthly' ? 'mes' : 'año'}
              </option>
            ))}
          </select>
        </Card>

        {/* Branding */}
        <Card shadow="none" className="mb-8">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Marca</h3>
          <div className="space-y-4">
            {/* Logo */}
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Logo</p>
              <AvatarPicker
                value={brandingLogoUrl}
                onChange={setBrandingLogoUrl}
                fallbackLabel={tenant.name?.charAt(0) || '?'}
              />
            </div>

            {/* Primary color */}
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Color principal</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandingColor}
                  onChange={(e) => setBrandingColor(e.target.value)}
                  className="w-10 h-10 rounded border border-gray-300 cursor-pointer p-0.5"
                />
                <span className="text-sm text-gray-700">{brandingColor}</span>
              </div>
            </div>

            {/* Tagline */}
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Tagline</p>
              <input
                type="text"
                value={brandingTagline}
                onChange={(e) => setBrandingTagline(e.target.value)}
                maxLength={200}
                placeholder="Ej: Abogados de confianza"
                className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveBranding}
              disabled={savingBranding}
            >
              {savingBranding ? 'Guardando...' : 'Guardar marca'}
            </Button>
          </div>
        </Card>

        {/* Usuarios */}
        <div className="flex items-center justify-between mb-3 mt-8">
          <h3 className="text-base font-semibold text-gray-900">Usuarios ({users.length})</h3>
          <Button variant="outline" size="sm" onClick={() => setShowUserModal(true)}>
            + Nuevo usuario
          </Button>
        </div>
        <Card shadow="none" padding="none" className="mb-8 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-800 text-left">
              <tr>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username} className="border-t border-gray-200">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 flex-shrink-0">
                          {(u.nombre || u.username).charAt(0).toUpperCase()}
                        </span>
                      )}
                      {u.username}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-900">
                    {[u.nombre, u.apellido].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-900">{u.email || '—'}</td>
                  <td className="px-4 py-2 text-gray-900 capitalize">
                    {u.role === 'admin' ? 'UsuarioAdmin' : 'Usuario'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${u.disabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {u.disabled ? 'Deshabilitado' : 'Activo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openEditUser(u)} className="text-xs text-gray-800 hover:underline mr-3">
                      Editar
                    </button>
                    <button onClick={() => handleToggleDisabled(u)} className="text-xs text-gray-800 hover:underline mr-3">
                      {u.disabled ? 'Habilitar' : 'Deshabilitar'}
                    </button>
                    <button onClick={() => handleDeleteUser(u.username)} className="text-xs text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Sin usuarios todavía
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Agente + módulos */}
        <h3 className="text-base font-semibold text-gray-900 mb-3 mt-8">Agente</h3>
        <div className="space-y-3">
          {bots.map((bot) => (
            <Card key={bot.bot_id} shadow="none">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900">{bot.name}</span>
                  <span className="ml-2 text-xs text-gray-700">{bot.business_type}</span>
                  <Link to={`/bots/${bot.bot_id}`} className="ml-2 text-xs text-primary-700 hover:underline">
                    Ver agente
                  </Link>
                </div>
                <Button variant="outline" size="sm" onClick={() => toggleBotModules(bot.bot_id)}>
                  {expandedBotId === bot.bot_id ? 'Ocultar módulos' : 'Módulos'}
                </Button>
              </div>

              {expandedBotId === bot.bot_id && (
                <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
                  {(botModules[bot.bot_id] || allModules.map((m) => ({
                    bot_id: bot.bot_id, module_key: m.module_key, granted: false, enabled: false,
                    module_name: m.name, module_description: m.description,
                  }))).map((mod) => (
                    <div key={mod.module_key} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{mod.module_name || mod.module_key}</p>
                        {mod.module_description && <p className="text-gray-700 text-xs">{mod.module_description}</p>}
                        {mod.enabled && <span className="text-xs text-green-700">habilitado por el tenant</span>}
                      </div>
                      <Button
                        variant={mod.granted ? 'danger' : 'primary'}
                        size="sm"
                        onClick={() => handleGrantToggle(bot.bot_id, mod.module_key, mod.granted)}
                      >
                        {mod.granted ? 'Revocar' : 'Otorgar'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
          {bots.length === 0 && (
            <Card shadow="none">
              <p className="text-center text-gray-400 py-6">
                Este tenant todavía no tiene un agente asociado. Creá uno desde{' '}
                <Link to="/bots" className="underline">Agentes</Link>.
              </p>
            </Card>
          )}
        </div>
      </div>

      {showUserModal && (
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
                <Button type="button" variant="outline" onClick={() => setShowUserModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={creatingUser}>
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
                  fallbackLabel={editForm.nombre || editingUser?.username || ''}
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

export default TenantDetail;
