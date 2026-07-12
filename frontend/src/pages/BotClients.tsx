import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { useAccentTheme } from '../hooks/useAccentTheme';
import { useClients } from '../hooks/useClients';
import botsService from '../services/bots.service';
import clientsService from '../services/clients.service';
import type { Bot } from '../types/bot.types';
import type { Client, ClientStatus } from '../types/client.types';

const statusColors: Record<ClientStatus, string> = {
  active: 'bg-green-200 text-green-950',
  blocked: 'bg-red-200 text-red-950',
  archived: 'bg-gray-200 text-gray-950',
};

const statusLabels: Record<ClientStatus, string> = {
  active: 'Activo',
  blocked: 'Bloqueado',
  archived: 'Archivado',
};

const sourceColors: Record<string, string> = {
  whatsapp: 'bg-green-200 text-green-950',
  telegram: 'bg-blue-200 text-blue-950',
  web: 'bg-purple-200 text-purple-950',
  manual: 'bg-gray-200 text-gray-950',
};

const ScoreBadge = ({ score }: { score: number }) => {
  const color =
    score >= 70
      ? 'bg-green-200 text-green-950'
      : score >= 40
      ? 'bg-yellow-200 text-yellow-950'
      : 'bg-gray-200 text-gray-900';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-base font-semibold ${color}`}>
      {score.toFixed(1)}
    </span>
  );
};

export const BotClients = () => {
  const { accent } = useAccentTheme();
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
        <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
          {/* Breadcrumb */}
          <nav className="mb-4">
            <ol className="flex items-center space-x-2 text-base text-gray-900">
              <li>
                <Link to="/bots" className="hover:underline" style={{ color: accent }}>
                  Agentes
                </Link>
              </li>
              <li>/</li>
              <li>
                <Link to={`/bots/${botId}`} className="hover:underline" style={{ color: accent }}>
                  {bot?.name || 'Agente'}
                </Link>
              </li>
              <li>/</li>
              <li className="text-gray-900">Clientes</li>
            </ol>
          </nav>

          <PageHeader
            title="Clientes"
            description={`${total} cliente${total !== 1 ? 's' : ''} de ${bot?.name}`}
            titleClassName="font-semibold uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
          />

          {/* Search */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono o email..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              />
              <Button type="submit" variant="primary">
                Buscar
              </Button>
            </div>
          </form>

          {error && <Alert variant="error" className="mb-6">Error: {error}</Alert>}

          {/* Tabla de clientes */}
          {clients.length === 0 ? (
            <Table>
              <TableBody>
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Users className="w-8 h-8 text-gray-800" />}
                      title="No hay clientes para este agente"
                      titleClassName="text-gray-900 text-xl"
                    />
                  </td>
                </tr>
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Score</TableHeaderCell>
                  <TableHeaderCell>Cliente</TableHeaderCell>
                  <TableHeaderCell>Canal</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Conversaciones</TableHeaderCell>
                  <TableHeaderCell>Último contacto</TableHeaderCell>
                  <TableHeaderCell align="right">Acciones</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {clients.map((client: Client) => (
                  <TableRow key={client.client_id}>
                    <TableCell>
                      <ScoreBadge score={client.score ?? 0} />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-lg font-normal text-gray-900">
                          {client.name || client.external_id}
                        </p>
                        {client.email && (
                          <p className="text-base text-gray-800">{client.email}</p>
                        )}
                        {client.phone && client.phone !== client.external_id && (
                          <p className="text-base text-gray-800">{client.phone}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 text-base font-medium rounded-full capitalize ${
                          sourceColors[client.source] || 'bg-gray-200 text-gray-950'
                        }`}
                      >
                        {client.source}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 text-base font-medium rounded-full ${statusColors[client.status]}`}
                      >
                        {statusLabels[client.status]}
                      </span>
                    </TableCell>
                    <TableCell textClassName="text-gray-800">
                      {client.total_conversations}
                    </TableCell>
                    <TableCell textClassName="text-gray-800">
                      {new Date(client.last_contact_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell align="right" className="font-medium">
                      <Button
                        variant="outline"
                        onClick={() =>
                          handleBlockClient(client.client_id, client.status === 'blocked')
                        }
                      >
                        {client.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Paginación */}
          {pages > 1 && (
            <div className="flex justify-center items-center mt-6 gap-2">
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
    </AppLayout>
  );
};

export default BotClients;
