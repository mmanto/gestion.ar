import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import clientsService from '../services/clients.service';
import botsService from '../services/bots.service';
import type { Client, ClientStatus, ClientFilters } from '../types/client.types';
import type { Bot } from '../types/bot.types';

const ScoreBadge = ({ score }: { score: number }) => {
  const color =
    score >= 70
      ? 'bg-green-100 text-green-800'
      : score >= 40
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {score.toFixed(1)}
    </span>
  );
};

const statusColors: Record<ClientStatus, string> = {
  active: 'bg-green-100 text-green-800',
  blocked: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<ClientStatus, string> = {
  active: 'Activo',
  blocked: 'Bloqueado',
  archived: 'Archivado',
};

const sourceIcons: Record<string, string> = {
  whatsapp: '💬',
  telegram: '✈️',
  web: '🌐',
  manual: '📝',
};

export const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [botsMap, setBotsMap] = useState<Record<string, Bot>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ClientFilters>({ limit: 20 });

  // Carga bots para mostrar nombre del bot junto a cada cliente
  useEffect(() => {
    const fetchBots = async () => {
      try {
        const data = await botsService.getBots({ limit: 200 });
        const map: Record<string, Bot> = {};
        data.bots.forEach((b) => { map[b.bot_id] = b; });
        setBotsMap(map);
      } catch (err) {
        console.error('Error fetching bots:', err);
      }
    };
    fetchBots();
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await clientsService.getAllClients({
        ...filters,
        page,
        limit: filters.limit || 20,
      });
      setClients(response.clients);
      setTotal(response.total);
      setPages(response.pages);
    } catch (err) {
      setError('Error cargando clientes');
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setFilters((prev) => ({ ...prev, search }));
  };

  const handleToggleBlock = async (client: Client) => {
    try {
      if (client.status === 'blocked') {
        await clientsService.unblockClient(client.bot_id, client.client_id);
      } else {
        await clientsService.blockClient(client.bot_id, client.client_id);
      }
      fetchClients();
    } catch (err) {
      console.error('Error toggling block status:', err);
    }
  };

  const handleStatusFilter = (newStatus: ClientStatus | '') => {
    setPage(1);
    setFilters((prev) => ({ ...prev, status: newStatus }));
  };

  if (loading && clients.length === 0) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Ciudadanos</h1>
              <p className="text-gray-600">
                {total} ciudadano{total !== 1 ? 's' : ''} en total
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <form onSubmit={handleSearch} className="flex gap-2 flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono o email..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Buscar
              </button>
            </form>

            <select
              value={filters.status || ''}
              onChange={(e) => handleStatusFilter(e.target.value as ClientStatus | '')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="blocked">Bloqueado</option>
              <option value="archived">Archivado</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Tabla de clientes */}
          {clients.length === 0 && !loading ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <p className="text-gray-500 text-lg">No hay ciudadanos todavía</p>
              <p className="text-gray-400 text-sm mt-1">
                Los clientes aparecerán aquí cuando interactúen con tus bots
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ciudadano
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bot
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Canal
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Conversaciones
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Último contacto
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client: Client) => (
                    <tr key={client.client_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <ScoreBadge score={client.score ?? 0} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="font-medium text-gray-900">
                            {client.name || client.external_id}
                          </p>
                          {client.email && (
                            <p className="text-sm text-gray-500">{client.email}</p>
                          )}
                          {client.phone && client.phone !== client.external_id && (
                            <p className="text-sm text-gray-500">{client.phone}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {botsMap[client.bot_id] ? (
                          <Link
                            to={`/bots/${client.bot_id}/clients`}
                            className="text-sm text-primary hover:text-primary-700 font-medium"
                          >
                            {botsMap[client.bot_id].name}
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-400">{client.bot_id}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg" title={client.source}>
                          {sourceIcons[client.source] || '❓'}
                        </span>
                        <span className="ml-2 text-sm text-gray-600 capitalize">
                          {client.source}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[client.status]}`}
                        >
                          {statusLabels[client.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.total_conversations}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(client.last_contact_at).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleToggleBlock(client)}
                          className={
                            client.status === 'blocked'
                              ? 'text-green-600 hover:text-green-900'
                              : 'text-red-600 hover:text-red-900'
                          }
                        >
                          {client.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {pages > 1 && (
            <div className="flex justify-center mt-6 gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Página {page} de {pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          )}
    </AppLayout>
  );
};

export default Clients;
