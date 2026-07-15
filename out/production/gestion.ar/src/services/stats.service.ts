import api from './api';
import type { ConversationStats, TimelineStats } from '../types/conversation.types';

const statsService = {
  async getStats(): Promise<ConversationStats> {
    const response = await api.get('/conversations/stats');
    return response.data.stats;
  },

  async getTimeline(days: number = 30): Promise<TimelineStats> {
    const response = await api.get(`/conversations/stats/timeline?days=${days}`);
    return response.data;
  },
};

export default statsService;
