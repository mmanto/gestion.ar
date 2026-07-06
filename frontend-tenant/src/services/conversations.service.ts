import api from './api';
import type { Conversation, ConversationMessage, ConversationsResponse, ConversationFilters } from '../types/conversation.types';

const conversationsService = {
  async getConversations(filters: ConversationFilters = {}): Promise<ConversationsResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.platform) params.append('platform', filters.platform);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.search) params.append('search', filters.search);
    if (filters.sort_by) params.append('sort_by', filters.sort_by);
    if (filters.order) params.append('order', filters.order);

    const response = await api.get(`/conversations?${params.toString()}`);
    return response.data;
  },

  async getConversationById(id: string): Promise<Conversation> {
    const response = await api.get(`/conversations/${id}`);
    return response.data.conversation;
  },

  async sendAgentMessage(conversationId: string, content: string): Promise<ConversationMessage> {
    const response = await api.post(`/conversations/${conversationId}/agent-message`, { content });
    return response.data.message;
  },
};

export default conversationsService;
