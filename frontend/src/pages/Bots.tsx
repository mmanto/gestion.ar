import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import {
  Button as UiButton,
  DataTable,
  defineTableDTO,
  type TableDTO,
} from '@mmanto/devbout-ui';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { Button } from '../components/common/Button';
import { Badge } from '../components/ui/badge';
import type { Bot, BotStatus } from '../types/bot.types';
import type { ModuleInfo, Tenant } from '../types/tenant.types';
import botsService from '../services/bots.service';
import tenantAdminService from '../services/tenantAdmin.service';

const statusLabels: Record<BotStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  maintenance: 'Mantenimiento',
};

const statusVariants: Record<BotStatus, 'success' | 'secondary' | 'warning'> = {
  active: 'success',
  inactive: 'secondary',
  maintenance: 'warning',
};

const emptyBotForm = { tenant_id: '', name: '', description: '', business_type: '' };

export const Bots = () => {
  const navigate = useNavigate();

  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [newBot, setNewBot] = useState(emptyBotForm);

  // Grilla con paginación propia: se trae la lista completa (igual que Tenants)
  // y el DataTable pagina/busca del lado del cliente.
  const fetchBots = useCallback(async () => {
    try {
      const response = await botsService.getBots({ limit: 100 });
      setBots(response.bots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando agentes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBots();
    tenantAdminService
      .listTenants(1, 100)
      .then((r) => setTenants(r.tenants))
      .catch(() => {});
    tenantAdminService
      .listModules()
      .then(setModules)
      .catch(() => {});
  }, [fetchBots]);

  const tenantNames = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.tenant_id, tenant.name])),
    [tenants],
  );

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
      setNewBot(emptyBotForm);
      setSelectedModules([]);
      await fetchBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el agente');
    } finally {
      setCreating(false);
    }
  };

  /**
   * DTO de la grilla (mismo patrón que Tenants): buscador, visibilidad de
   * columnas, paginación y acciones por fila. El alta sigue en el diálogo
   * propio porque el schema del paquete no cubre el select de tenant ni la
   * multi-selección de módulos.
   */
  const dto = useMemo<TableDTO<Bot>>(
    () =>
      defineTableDTO<Bot>({
        toolbarActions: (
          <UiButton onClick={() => setShowCreateModal(true)}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            Crear agente
          </UiButton>
        ),
        // Sin columna de checks: se opera fila por fila.
        selectable: false,
        // Cabecera dentro del DataTable: hereda su layout (título + métricas
        // arriba del toolbar, con el mismo padding que el resto del componente).
        header: (rows) => (
          <PageHeader
            title="Mis Agentes"
            description={`${rows.length} agente${rows.length !== 1 ? 's' : ''} en total`}
          />
        ),
        // Grilla controlada: al declarar `onDataChange` renderiza `data`, así el
        // refetch posterior al alta se refleja en la tabla.
        onDataChange: setBots,
        search: { columnId: 'name', placeholder: 'Buscar agente' },
        columnLabels: {
          name: 'Agente',
          status: 'Estado',
          tenant: 'Tenant',
          business_type: 'Tipo de negocio',
          total_clients: 'Clientes',
          total_conversations: 'Chats',
          total_messages: 'Mensajes',
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
              <Badge variant={statusVariants[row.original.status]}>
                {statusLabels[row.original.status]}
              </Badge>
            ),
          },
          {
            id: 'tenant',
            header: 'Tenant',
            cell: ({ row }) =>
              tenantNames.get(row.original.tenant_id) ?? row.original.tenant_id,
          },
          {
            id: 'business_type',
            accessorKey: 'business_type',
            header: 'Tipo de negocio',
          },
          {
            id: 'total_clients',
            header: 'Clientes',
            cell: ({ row }) => (
              <span className="tabular-nums">{row.original.total_clients}</span>
            ),
          },
          {
            id: 'total_conversations',
            header: 'Chats',
            cell: ({ row }) => (
              <span className="tabular-nums">{row.original.total_conversations}</span>
            ),
          },
          {
            id: 'total_messages',
            header: 'Mensajes',
            cell: ({ row }) => (
              <span className="tabular-nums">{row.original.total_messages}</span>
            ),
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
    [navigate, tenantNames],
  );

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">Error: {error}</Alert>}

        <DataTable dto={dto} data={bots} />
      </div>

      {/* Create Bot Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
