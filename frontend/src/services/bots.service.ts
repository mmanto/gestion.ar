/**
 * Bots Service - HTTP service for bot management
 */

import api from './api';
import type {
  Bot,
  BotCreate,
  BotUpdate,
  BotsResponse,
  BotResponse,
  BotFilters,
  BotStats,
} from '../types/bot.types';

const botsService = {
  /**
   * Get list of bots with pagination and filters
   */
  async getBots(filters: BotFilters = {}): Promise<BotsResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.status) params.append('status', filters.status);

    const response = await api.get<BotsResponse>(`/bots?${params.toString()}`);
    return response.data;
  },

  /**
   * Get a single bot by ID
   */
  async getBotById(botId: string): Promise<Bot> {
    const response = await api.get<BotResponse>(`/bots/${botId}`);
    return response.data.bot;
  },

  /**
   * Create a new bot
   */
  async createBot(botData: BotCreate): Promise<Bot> {
    const response = await api.post<BotResponse>('/bots', botData);
    return response.data.bot;
  },

  /**
   * Update an existing bot
   */
  async updateBot(botId: string, updateData: BotUpdate): Promise<Bot> {
    const response = await api.put<BotResponse>(`/bots/${botId}`, updateData);
    return response.data.bot;
  },

  /**
   * Delete a bot (soft delete)
   */
  async deleteBot(botId: string): Promise<void> {
    await api.delete(`/bots/${botId}`);
  },

  /**
   * Get bot statistics
   */
  async getBotStats(botId: string): Promise<BotStats> {
    const response = await api.get<{ success: boolean; stats: BotStats }>(
      `/bots/${botId}/stats`
    );
    return response.data.stats;
  },
};

export default botsService;
