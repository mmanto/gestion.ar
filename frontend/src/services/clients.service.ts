/**
 * Clients Service - HTTP service for client management
 */

import api from './api';
import type {
  Client,
  ClientUpdate,
  ClientsResponse,
  ClientResponse,
  ClientFilters,
} from '../types/client.types';
import type { ConversationsResponse } from '../types/conversation.types';

const clientsService = {
  /**
   * Get list of clients for a bot with pagination and filters
   */
  async getClients(botId: string, filters: ClientFilters = {}): Promise<ClientsResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);

    const response = await api.get<ClientsResponse>(
      `/bots/${botId}/clients?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get a single client by ID
   */
  async getClientById(botId: string, clientId: string): Promise<Client> {
    const response = await api.get<ClientResponse>(
      `/bots/${botId}/clients/${clientId}`
    );
    return response.data.client;
  },

  /**
   * Update a client
   */
  async updateClient(
    botId: string,
    clientId: string,
    updateData: ClientUpdate
  ): Promise<Client> {
    const response = await api.put<ClientResponse>(
      `/bots/${botId}/clients/${clientId}`,
      updateData
    );
    return response.data.client;
  },

  /**
   * Block a client
   */
  async blockClient(botId: string, clientId: string): Promise<void> {
    await api.post(`/bots/${botId}/clients/${clientId}/block`);
  },

  /**
   * Unblock a client
   */
  async unblockClient(botId: string, clientId: string): Promise<void> {
    await api.post(`/bots/${botId}/clients/${clientId}/unblock`);
  },

  /**
   * Get all clients across all bots for the current user
   */
  async getAllClients(filters: ClientFilters = {}): Promise<ClientsResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);

    const response = await api.get<ClientsResponse>(
      `/clients?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get conversations for a client
   */
  async getClientConversations(
    botId: string,
    clientId: string,
    filters: { page?: number; limit?: number } = {}
  ): Promise<ConversationsResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const response = await api.get<ConversationsResponse>(
      `/bots/${botId}/clients/${clientId}/conversations?${params.toString()}`
    );
    return response.data;
  },
};

export default clientsService;
