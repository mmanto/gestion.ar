import { useState, useEffect, useCallback } from 'react';
import { Users, MessageCircle } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { Drawer } from '../components/common/Drawer';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import MessagesList from '../components/messages/MessagesList';
import { useAuth } from '../hooks/useAuth';
import clientsService from '../services/clients.service';
import botsService from '../services/bots.service';
import type { Client, ClientStatus, ClientFilters } from '../types/client.types';
import type { TenantBotSummary } from '../types/bot.types';
import type { ConversationMessage } from '../types/conversation.types';

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

export const Clients = () => {
  const { user } = useAuth();
  const canBlock = user?.role === 'admin';
  const [clients, setClients] = useState<Client[]>([]);
  const [botsMap, setBotsMap] = useState<Record<string, TenantBotSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ClientFilters>({ limit: 20 });

  // Drawer de conversación
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  // Carga bots para mostrar nombre del bot junto a cada cliente
  useEffect(() => {
    const fetchBots = async () => {
      try {
        const data = await botsService.getBots({ limit: 100 });
        const map: Record<string, TenantBotSummary> = {};
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

  const handleOpenConversation = async (client: Client) => {
    setSelectedClient(client);
    setDrawerOpen(true);
    setConversationMessages([]);
    setConversationError(null);
    setConversationLoading(true);
    try {
      const response = await clientsService.getClientConversations(client.bot_id, client.client_id, { limit: 50 });
      const allMessages = response.conversations
        .flatMap((conv) => conv.messages)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setConversationMessages(allMessages);
    } catch (err) {
      setConversationError('Error cargando la conversación');
      console.error('Error fetching client conversations:', err);
    } finally {
      setConversationLoading(false);
    }
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
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
        <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
          <PageHeader
            title="Prospectos"
            description={`${total} contacto${total !== 1 ? 's' : ''} en total`}
            titleClassName="font-semibold uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
          />

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
              <Button type="submit" variant="primary">
                Buscar
              </Button>
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

          {error && <Alert variant="error" className="mb-6">{error}</Alert>}

          {/* Tabla de clientes */}
          {clients.length === 0 && !loading ? (
            <Table>
              <TableBody>
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<Users className="w-8 h-8 text-gray-800" />}
                      title="No hay contactos todavía"
                      description="Los clientes aparecerán aquí cuando interactúen con tus agentes"
                      titleClassName="text-gray-900 text-xl"
                      descriptionClassName="text-gray-900 text-base"
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
                  <TableHeaderCell>Contacto</TableHeaderCell>
                  <TableHeaderCell>Agente</TableHeaderCell>
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
                      <span className="text-base text-gray-800">
                        {botsMap[client.bot_id]?.name || client.bot_id}
                      </span>
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenConversation(client)}
                          title="Ver conversación"
                          className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                        {canBlock && (
                          <Button
                            variant="outline"
                            onClick={() => handleToggleBlock(client)}
                          >
                            {client.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Paginación */}
          {pages > 1 && (
            <div className="flex justify-center items-center mt-6 gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <span className="px-4 py-2 text-base text-gray-900">
                Página {page} de {pages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>

        <Drawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          title={selectedClient ? selectedClient.name || selectedClient.external_id : ''}
        >
          {conversationLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-700 text-sm">Cargando conversación...</p>
            </div>
          ) : conversationError ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <p className="text-red-600 text-sm">{conversationError}</p>
            </div>
          ) : (
            <MessagesList messages={conversationMessages} />
          )}
        </Drawer>
    </AppLayout>
  );
};

export default Clients;
