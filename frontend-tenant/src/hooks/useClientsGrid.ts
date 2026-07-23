import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { useIsMobile } from './useIsMobile';
import clientsService from '../services/clients.service';
import type { Client, ColorFilter } from '../types/client.types';
import type { ConversationMessage } from '../types/conversation.types';
import { getWhatsappNumber, openWhatsapp } from '../utils/whatsapp';

/**
 * Estado y acciones de la grilla de clientes del Escritorio — compartido
 * entre la presentación default (components/dashboard/ClientsGrid.tsx) y la
 * de kero (templates/kero/ClientsGrid.tsx), que solo difieren en el diseño.
 */
export function useClientsGrid(colorFilter?: ColorFilter) {
  const { user } = useAuth();
  const canBlock = user?.role === 'admin';
  const isMobile = useIsMobile();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  // Drawer de resumen ejecutivo
  const [summaryClient, setSummaryClient] = useState<Client | null>(null);
  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);

  // Drawer de datos completos del cliente
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const response = await clientsService.getAllClients({
        limit: 20,
        search: appliedSearch,
        color_semaforo: colorFilter,
      });
      setClients(response.clients);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, colorFilter]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search);
  };

  const handleCloseSearch = () => {
    setSearchExpanded(false);
    setSearch('');
    setAppliedSearch('');
  };

  const handleOpenWhatsapp = (client: Client) => {
    const number = getWhatsappNumber(client);
    if (number) openWhatsapp(number);
  };

  const handleOpenSummary = (client: Client) => {
    setSummaryClient(client);
    setSummaryDrawerOpen(true);
  };

  const handleOpenDetail = (client: Client) => {
    setDetailClient(client);
    setDetailDrawerOpen(true);
  };

  const handleToggleDestacado = async (client: Client) => {
    try {
      const updated = await clientsService.updateClient(client.bot_id, client.client_id, {
        destacado: !client.destacado,
      });
      setClients((prev) => prev.map((c) => (c.client_id === updated.client_id ? updated : c)));
    } catch (err) {
      console.error('Error toggling destacado:', err);
    }
  };

  const handleToggleBlock = async (client: Client) => {
    try {
      if (client.status === 'blocked') {
        await clientsService.unblockClient(client.bot_id, client.client_id);
      } else {
        await clientsService.blockClient(client.bot_id, client.client_id);
      }
      const newStatus: Client['status'] = client.status === 'blocked' ? 'active' : 'blocked';
      setDetailClient((prev) =>
        prev && prev.client_id === client.client_id ? { ...prev, status: newStatus } : prev
      );
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

  return {
    canBlock,
    isMobile,
    clients,
    loading,
    search,
    setSearch,
    searchExpanded,
    setSearchExpanded,
    handleSearch,
    handleCloseSearch,
    selectedClient,
    drawerOpen,
    setDrawerOpen,
    conversationMessages,
    conversationLoading,
    conversationError,
    summaryClient,
    summaryDrawerOpen,
    setSummaryDrawerOpen,
    detailClient,
    detailDrawerOpen,
    setDetailDrawerOpen,
    handleOpenWhatsapp,
    handleOpenSummary,
    handleOpenDetail,
    handleToggleDestacado,
    handleToggleBlock,
    handleOpenConversation,
  };
}
