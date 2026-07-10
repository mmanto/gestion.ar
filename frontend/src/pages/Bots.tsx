import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bot as BotIcon } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useBots } from '../hooks/useBots';
import type { Bot, BotStatus } from '../types/bot.types';
import type { ModuleInfo, Tenant } from '../types/tenant.types';
import botsService from '../services/bots.service';
import tenantAdminService from '../services/tenantAdmin.service';

const statusColors: Record<BotStatus, string> = {
  active: 'bg-green-200 text-green-950',
  inactive: 'bg-gray-200 text-gray-950',
  maintenance: 'bg-yellow-200 text-yellow-950',
};

const statusLabels: Record<BotStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  maintenance: 'Mantenimiento',
};

export const Bots = () => {
  const { bots, loading, error, total, page, pages, goToPage, refetch } = useBots({
    limit: 10,
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [newBot, setNewBot] = useState({
    tenant_id: '',
    name: '',
    description: '',
    business_type: '',
  });

  useEffect(() => {
    tenantAdminService.listTenants(1, 100).then((r) => setTenants(r.tenants)).catch(() => {});
    tenantAdminService.listModules().then(setModules).catch(() => {});
  }, []);

  const toggleModule = (moduleKey: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleKey) ? prev.filter((k) => k !== moduleKey) : [...prev, moduleKey]
    );
  };

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBot.name || !newBot.business_type || !newBot.tenant_id) return;

    try {
      setCreating(true);
      await botsService.createBot({ ...newBot, module_keys: selectedModules });
      setShowCreateModal(false);
      setNewBot({ tenant_id: '', name: '', description: '', business_type: '' });
      setSelectedModules([]);
      refetch();
    } catch (err) {
      console.error('Error creating bot:', err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
        <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
          <PageHeader
            title="Mis Agentes"
            description={`${total} agente${total !== 1 ? 's' : ''} en total`}
            titleClassName="font-light uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
            actions={
              <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                + Crear Agente
              </Button>
            }
          />

          {error && <Alert variant="error" className="mb-6">Error: {error}</Alert>}

          {/* Bots Grid */}
          {bots.length === 0 ? (
            <Card shadow="none">
              <EmptyState
                icon={<BotIcon className="w-8 h-8 text-gray-800" />}
                title="Todavía no tenés agentes"
                description="Creá tu primer agente para empezar"
                titleClassName="text-gray-900 text-xl"
                descriptionClassName="text-gray-900 text-base"
                action={
                  <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                    Crear tu primer agente
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bots.map((bot: Bot) => (
                <Link key={bot.bot_id} to={`/bots/${bot.bot_id}`}>
                  <Card shadow="none">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-normal text-gray-900">
                        {bot.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-base font-medium rounded-full ${
                          statusColors[bot.status]
                        }`}
                      >
                        {statusLabels[bot.status]}
                      </span>
                    </div>

                    {bot.description && (
                      <p className="text-gray-800 text-base mb-4 line-clamp-2">
                        {bot.description}
                      </p>
                    )}

                    <div className="text-base text-gray-800 mb-4">
                      <span className="inline-block bg-gray-200 rounded-full px-2 py-1">
                        {bot.business_type}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-base">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {bot.total_clients}
                        </p>
                        <p className="text-gray-900">Clientes</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {bot.total_conversations}
                        </p>
                        <p className="text-gray-900">Chats</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {bot.total_messages}
                        </p>
                        <p className="text-gray-900">Mensajes</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex justify-center items-center mt-8 gap-2">
              <Button variant="outline" onClick={() => goToPage(page - 1)} disabled={page === 1}>
                Anterior
              </Button>
              <span className="px-4 py-2 text-base text-gray-900">
                Página {page} de {pages}
              </span>
              <Button variant="outline" onClick={() => goToPage(page + 1)} disabled={page === pages}>
                Siguiente
              </Button>
            </div>
          )}
        </div>

      {/* Create Bot Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Nuevo Agente</h2>
            <form onSubmit={handleCreateBot}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Tenant *
                </label>
                <select
                  value={newBot.tenant_id}
                  onChange={(e) => setNewBot({ ...newBot, tenant_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Seleccioná un tenant...</option>
                  {tenants.map((t) => (
                    <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Nombre del Agente *
                </label>
                <input
                  type="text"
                  value={newBot.name}
                  onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Asistente Mi Negocio"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Tipo de Negocio *
                </label>
                <input
                  type="text"
                  value={newBot.business_type}
                  onChange={(e) =>
                    setNewBot({ ...newBot, business_type: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: restaurante, clínica, tienda"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Descripción
                </label>
                <textarea
                  value={newBot.description}
                  onChange={(e) =>
                    setNewBot({ ...newBot, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                  placeholder="Descripción opcional del agente"
                />
              </div>
              {modules.length > 0 && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    Módulos a otorgar
                  </label>
                  <div className="space-y-2">
                    {modules.map((m) => (
                      <label key={m.module_key} className="flex items-start gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedModules.includes(m.module_key)}
                          onChange={() => toggleModule(m.module_key)}
                        />
                        <span>
                          {m.name}
                          {m.description && (
                            <span className="block text-xs text-gray-700">{m.description}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-700 mt-1">
                    El tenant sólo podrá habilitar/deshabilitar los módulos otorgados acá.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={creating}>
                  Crear Agente
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AppLayout>
  );
};

export default Bots;
