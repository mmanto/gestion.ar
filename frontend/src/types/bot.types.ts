/**
 * Bot types - TypeScript interfaces for Bot entity
 */

export type BotStatus = 'active' | 'inactive' | 'maintenance';
export type BotChannel = 'whatsapp' | 'telegram' | 'web';

// Fase 2: Flujo conversacional de captura de datos
export interface FlowStep {
  field: string;           // 'name' | 'email' | 'phone' | 'case_type' | 'description'
  question: string;
  field_type: 'text' | 'email' | 'phone' | 'choice';
  choices?: string[];
  required?: boolean;
  validation_hint?: string;
  score_weight?: number;
}

export interface FlowConfig {
  enabled: boolean;
  steps: FlowStep[];
  completion_message?: string;
  skip_if_known?: boolean;
}

export interface BotConfig {
  system_prompt: string;
  welcome_message: string;
  fallback_message: string;
  max_tokens: number;
  temperature: number;
  use_rag: boolean;
  rag_results_count: number;
  rate_limit_messages: number;
  rate_limit_window: number;
  flow?: FlowConfig | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ius_config?: Record<string, any> | null;
}

export interface BotChannelConfig {
  channel: BotChannel;
  enabled: boolean;
  webhook_url?: string;
}

export interface Bot {
  bot_id: string;
  name: string;
  description?: string;
  business_type: string;
  owner_id: string;
  status: BotStatus;
  config: BotConfig;
  channels: BotChannelConfig[];
  channel_ids: string[];
  knowledge_base_id?: string;
  created_at: string;
  updated_at: string;
  total_clients: number;
  total_conversations: number;
  total_messages: number;
  metadata?: Record<string, unknown>;
}

export interface BotCreate {
  name: string;
  description?: string;
  business_type: string;
  config?: Partial<BotConfig>;
  channels?: BotChannelConfig[];
}

export interface BotUpdate {
  name?: string;
  description?: string;
  business_type?: string;
  status?: BotStatus;
  config?: Partial<BotConfig>;
  channels?: BotChannelConfig[];
}

export interface BotsResponse {
  success: boolean;
  bots: Bot[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface BotResponse {
  success: boolean;
  bot: Bot;
  message?: string;
}

export interface BotFilters {
  page?: number;
  limit?: number;
  status?: BotStatus | '';
}

export interface BotStats {
  bot_id: string;
  total_clients: number;
  total_conversations: number;
  total_messages: number;
  status: BotStatus;
  created_at: string;
  updated_at: string;
}
