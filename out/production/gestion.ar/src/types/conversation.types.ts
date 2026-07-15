import type { Platform, MessageRole } from '../utils/constants';

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  timestamp: string;
  metadata?: {
    tokens_used?: number;
    estimated_cost_usd?: number;
    model?: string;
    [key: string]: unknown;
  };
}

export interface Conversation {
  conversation_id: string;
  bot_id?: string;
  client_id?: string;
  user_id: string;
  channel?: Platform;
  messages: ConversationMessage[];
  created_at: string;
  updated_at: string;
  total_tokens_used: number;
  total_cost_usd: number;
  metadata?: {
    source?: Platform;
    [key: string]: unknown;
  };
}

export interface ConversationStats {
  total_conversations: number;
  total_messages: number;
  total_tokens_used: number;
  total_cost_usd: number;
  active_users: number;
  conversations_by_platform: {
    whatsapp: number;
    telegram: number;
    other: number;
  };
}

export interface TimelineDataPoint {
  date: string;
  conversations: number;
  messages: number;
  tokens: number;
  cost: number;
}

export interface TimelineStats {
  days: number;
  timeline: TimelineDataPoint[];
}

export interface ConversationsResponse {
  success: boolean;
  conversations: Conversation[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ConversationFilters {
  page?: number;
  limit?: number;
  user_id?: string;
  platform?: Platform | '';
  date_from?: string;
  date_to?: string;
  search?: string;
  sort_by?: string;
  order?: 'asc' | 'desc';
  bot_id?: string;
  client_id?: string;
}
