import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Users } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Drawer } from '../common/Drawer';
import { Button } from '../common/Button';
import { SemaforoBadge } from '../common/SemaforoBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import MessagesList from '../messages/MessagesList';
import clientsService from '../../services/clients.service';
import botsService from '../../services/bots.service';
import type { Client, ClientStatus } from '../../types/client.types';
import type { TenantBotSummary } from '../../types/bot.types';
import type { ConversationMessage } from '../../types/conversation.types';

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

const ClientsGrid = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [botsMap, setBotsMap] = useState<Record<string, TenantBotSummary>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  useEffect(() => {
    botsService.getBots({ limit: 100 })
      .then((r) => {
        const map: Record<string, TenantBotSummary> = {};
        r.bots.forEach((b) => { map[b.bot_id] = b; });
        setBotsMap(map);
      })
      .catch((err) => console.error('Error cargando bots:', err));
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const response = await clientsService.getAllClients({ limit: 20, search: appliedSearch });
      setClients(response.clients);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search);
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

  return (
    <div className="mt-6">
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
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

      {loading && clients.length === 0 ? (
        <Card shadow="none">
          <p className="text-sm text-gray-700">Cargando clientes...</p>
        </Card>
      ) : clients.length === 0 ? (
        <Card shadow="none">
          <EmptyState
            icon={<Users className="w-8 h-8 text-gray-800" />}
            title="No hay contactos todavía"
            description="Los clientes aparecerán aquí cuando interactúen con tus agentes"
            titleClassName="text-gray-900 text-xl"
            descriptionClassName="text-gray-900 text-base"
          />
        </Card>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Calificación</TableHeaderCell>
              <TableHeaderCell>Contacto</TableHeaderCell>
              <TableHeaderCell>Agente</TableHeaderCell>
              <TableHeaderCell>Canal</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Último contacto</TableHeaderCell>
              <TableHeaderCell align="right">Acciones</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.client_id}>
                <TableCell>
                  <SemaforoBadge color={client.color_semaforo} estado={client.estado} />
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
                  {new Date(client.last_contact_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </TableCell>
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenConversation(client)}
                      title="Ver conversación"
                      className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
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
    </div>
  );
};

export default ClientsGrid;
