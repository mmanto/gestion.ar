import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { useClients } from '../hooks/useClients';
import botsService from '../services/bots.service';
import clientsService from '../services/clients.service';
import type { Bot } from '../types/bot.types';
import type { Client, ClientStatus } from '../types/client.types';

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

export const BotClients = () => {
  const { botId } = useParams<{ botId: string }>();
  const [bot, setBot] = useState<Bot | null>(null);
  const [botLoading, setBotLoading] = useState(true);
  const [search, setSearch] = useState('');

  const {
    clients,
    loading,
    error,
    total,
    page,
    pages,
    goToPage,
    updateFilters,
    refetch,
  } = useClients(botId || '', { limit: 10 });

  useEffect(() => {
    const fetchBot = async () => {
      if (!botId) return;
      try {
        const data = await botsService.getBotById(botId);
        setBot(data);
      } catch (err) {
        console.error('Error fetching bot:', err);
      } finally {
        setBotLoading(false);
      }
    };
    fetchBot();
  }, [botId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search });
  };

  const handleBlockClient = async (clientId: string, isBlocked: boolean) => {
    if (!botId) return;
    try {
      if (isBlocked) {
        await clientsService.unblockClient(botId, clientId);
      } else {
        await clientsService.blockClient(botId, clientId);
      }
      refetch();
    } catch (err) {
      console.error('Error toggling block status:', err);
    }
  };

  if (botLoading || loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
          {/* Breadcrumb */}
          <nav className="mb-4">
            <ol className="flex items-center space-x-2 text-sm text-gray-500">
              <li>
                <Link to="/bots" className="hover:text-indigo-600">
                  Bots
                </Link>
              </li>
              <li>/</li>
              <li>
                <Link to={`/bots/${botId}`} className="hover:text-indigo-600">
                  {bot?.name || 'Bot'}
                </Link>
              </li>
              <li>/</li>
              <li className="text-gray-900">Clientes</li>
            </ol>
          </nav>

          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
              <p className="text-gray-600">
                {total} cliente{total !== 1 ? 's' : ''} de {bot?.name}
              </p>
            </div>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono o email..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Buscar
              </button>
            </div>
          </form>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">Error: {error}</p>
            </div>
          )}

          {/* Clients Table */}
          {clients.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No hay clientes para este bot</p>
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
                      Cliente
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
                        <span className="text-lg" title={client.source}>
                          {sourceIcons[client.source] || '❓'}
                        </span>
                        <span className="ml-2 text-sm text-gray-600">
                          {client.source}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            statusColors[client.status]
                          }`}
                        >
                          {statusLabels[client.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.total_conversations}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(client.last_contact_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() =>
                            handleBlockClient(
                              client.client_id,
                              client.status === 'blocked'
                            )
                          }
                          className={`${
                            client.status === 'blocked'
                              ? 'text-green-600 hover:text-green-900'
                              : 'text-red-600 hover:text-red-900'
                          }`}
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

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex justify-center mt-6 gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Anterior
              </button>
              <span className="px-4 py-2">
                Página {page} de {pages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
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

export default BotClients;
