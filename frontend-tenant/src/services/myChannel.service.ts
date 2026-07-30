/**
 * My Channel Service (frontend-tenant) - autoservicio del link de chat
 * propio del usuario logueado (a lo sumo un canal web por bot+usuario,
 * ver uq_channels_bot_owner_web).
 */

import api from './api';

export interface MyChannel {
  channel_id: string;
  name: string;
  status: string;
}

const myChannelService = {
  async getMyChannel(botId: string): Promise<MyChannel> {
    const response = await api.post<{ success: boolean; channel: MyChannel }>(
      `/tenant/bots/${botId}/my-channel`
    );
    return response.data.channel;
  },
};

export default myChannelService;
