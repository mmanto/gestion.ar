import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import tenantAdminService from '../../services/tenantAdmin.service';
import botsService from '../../services/bots.service';
import type { Tenant, TenantStatus, TenantUser, TenantUserRole, BotModuleInfo, ModuleInfo } from '../../types/tenant.types';
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
  const [newUser, setNewUser] = useState<{ username: string; password: string; email: string; role: TenantUserRole }>({
    username: '', password: '', email: '', role: 'operativo',
  });

  const [expandedBotId, setExpandedBotId] = useState<string | null>(null);
  const [botModules, setBotModules] = useState<Record<string, BotModuleInfo[]>>({});
  const [allModules, setAllModules] = useState<ModuleInfo[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [tenantData, usersData, botsData, modulesData] = await Promise.all([
        tenantAdminService.getTenant(tenantId),
        tenantAdminService.listUsers(tenantId, 1, 100),
        botsService.getBots({ tenant_id: tenantId, limit: 100 }),
        tenantAdminService.listModules(),
      ]);
      setTenant(tenantData);
      setUsers(usersData.users);
      setBots(botsData.bots);
      setAllModules(modulesData);
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !newUser.username || !newUser.password) return;
    try {
      setCreatingUser(true);
      await tenantAdminService.createUser({ ...newUser, tenant_id: tenantId, email: newUser.email || undefined });
      setShowUserModal(false);
      setNewUser({ username: '', password: '', email: '', role: 'operativo' });
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
          titleClassName="font-light uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
          actions={
            <Link to="/admin/tenants" className="text-sm text-gray-600 hover:underline">
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
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {statusLabels[s]}
              </button>
            ))}
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
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{u.username}</td>
                  <td className="px-4 py-2 text-gray-700">{u.email || '—'}</td>
                  <td className="px-4 py-2 text-gray-700 capitalize">
                    {u.role === 'admin' ? 'UsuarioAdmin' : 'Usuario'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${u.disabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {u.disabled ? 'Deshabilitado' : 'Activo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => handleToggleDisabled(u)} className="text-xs text-gray-600 hover:underline mr-3">
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
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Sin usuarios todavía
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Bots + módulos */}
        <h3 className="text-base font-semibold text-gray-900 mb-3 mt-8">Bots ({bots.length})</h3>
        <div className="space-y-3">
          {bots.map((bot) => (
            <Card key={bot.bot_id} shadow="none">
              <div className="flex items-center justify-between">
                <div>
                  <Link to={`/bots/${bot.bot_id}`} className="font-medium text-gray-900 hover:underline">
                    {bot.name}
                  </Link>
                  <span className="ml-2 text-xs text-gray-500">{bot.business_type}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => toggleBotModules(bot.bot_id)}>
                  {expandedBotId === bot.bot_id ? 'Ocultar módulos' : 'Módulos'}
                </Button>
              </div>

              {expandedBotId === bot.bot_id && (
                <div className="mt-4 border-t border-gray-100 pt-4 space-y-2">
                  {(botModules[bot.bot_id] || allModules.map((m) => ({
                    bot_id: bot.bot_id, module_key: m.module_key, granted: false, enabled: false,
                    module_name: m.name, module_description: m.description,
                  }))).map((mod) => (
                    <div key={mod.module_key} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{mod.module_name || mod.module_key}</p>
                        {mod.module_description && <p className="text-gray-500 text-xs">{mod.module_description}</p>}
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
                Este tenant todavía no tiene bots. Creá uno desde{' '}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario *</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
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
    </AppLayout>
  );
};

export default TenantDetail;
