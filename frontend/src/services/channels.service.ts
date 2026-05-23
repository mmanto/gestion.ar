/**
 * Channels Service - HTTP service for channel management
 */

import api from './api';
import type {
  Channel,
  ChannelCreate,
  ChannelUpdate,
  ChannelsResponse,
  ChannelResponse,
  ChannelFilters,
} from '../types/channel.types';

const channelsService = {
  /**
   * Get list of channels for a bot with pagination and filters
   */
  async getChannels(botId: string, filters: ChannelFilters = {}): Promise<ChannelsResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.channel_type) params.append('channel_type', filters.channel_type);
    if (filters.status) params.append('status', filters.status);

    const response = await api.get<ChannelsResponse>(
      `/bots/${botId}/channels?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get a single channel by ID
   */
  async getChannelById(botId: string, channelId: string): Promise<Channel> {
    const response = await api.get<ChannelResponse>(
      `/bots/${botId}/channels/${channelId}`
    );
    return response.data.channel;
  },

  /**
   * Create a new channel
   */
  async createChannel(botId: string, channelData: Omit<ChannelCreate, 'bot_id'>): Promise<Channel> {
    const response = await api.post<ChannelResponse>(
      `/bots/${botId}/channels`,
      { ...channelData, bot_id: botId }
    );
    return response.data.channel;
  },

  /**
   * Update a channel
   */
  async updateChannel(
    botId: string,
    channelId: string,
    updateData: ChannelUpdate
  ): Promise<Channel> {
    const response = await api.put<ChannelResponse>(
      `/bots/${botId}/channels/${channelId}`,
      updateData
    );
    return response.data.channel;
  },

  /**
   * Activate a channel
   */
  async activateChannel(botId: string, channelId: string): Promise<void> {
    await api.post(`/bots/${botId}/channels/${channelId}/activate`);
  },

  /**
   * Deactivate a channel
   */
  async deactivateChannel(botId: string, channelId: string): Promise<void> {
    await api.post(`/bots/${botId}/channels/${channelId}/deactivate`);
  },

  /**
   * Delete a channel
   */
  async deleteChannel(botId: string, channelId: string): Promise<void> {
    await api.delete(`/bots/${botId}/channels/${channelId}`);
  },

  /**
   * Get QR code image URL for a web channel.
   * Returns an object URL pointing to the PNG blob — caller must revoke it when done.
   */
  async getChannelQrCode(botId: string, channelId: string, baseUrl: string): Promise<string> {
    const response = await api.get(
      `/bots/${botId}/channels/${channelId}/qr-code`,
      { params: { base_url: baseUrl }, responseType: 'blob' }
    );
    return URL.createObjectURL(response.data as Blob);
  },
};

export default channelsService;
