/**
 * Channel types - TypeScript interfaces for Channel entity
 */

export type ChannelType = 'whatsapp' | 'telegram' | 'web' | 'pwa';
export type ChannelStatus = 'pending' | 'active' | 'inactive' | 'error';
export type WhatsAppProvider = 'meta' | 'twilio';

// Configuración específica para Meta/Facebook Cloud API
export interface MetaWhatsAppConfig {
  phone_number_id: string;
  access_token: string;
  verify_token?: string;
  api_version?: string;
  business_account_id?: string;
  app_secret?: string;
}

// Configuración específica para Twilio
export interface TwilioWhatsAppConfig {
  account_sid: string;
  auth_token: string;
  phone_number: string;
  messaging_service_sid?: string;
}

// Configuración de WhatsApp con soporte multi-proveedor
export interface WhatsAppConfig {
  provider: WhatsAppProvider;
  meta_config?: MetaWhatsAppConfig;
  twilio_config?: TwilioWhatsAppConfig;
  // Campos legacy (deprecated)
  phone_number_id?: string;
  access_token?: string;
  verify_token?: string;
  api_version?: string;
  business_account_id?: string;
}

export interface TelegramConfig {
  bot_token: string;
  bot_username?: string;
  webhook_secret?: string;
}

export interface WebConfig {
  allowed_origins?: string[] | null;
}

export interface PwaConfig {
  allowed_origins?: string[] | null;
  notification_icon?: string;
  notification_badge?: string;
  vapid_subject?: string;
}

export interface Channel {
  channel_id: string;
  bot_id: string;
  channel_type: ChannelType;
  name: string;
  status: ChannelStatus;
  whatsapp_config?: WhatsAppConfig;
  telegram_config?: TelegramConfig;
  web_config?: WebConfig;
  pwa_config?: PwaConfig;
  webhook_url?: string;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  total_messages_received: number;
  total_messages_sent: number;
  metadata?: Record<string, unknown>;
}

export interface ChannelCreate {
  bot_id: string;
  channel_type: ChannelType;
  name: string;
  whatsapp_config?: WhatsAppConfig;
  telegram_config?: TelegramConfig;
  web_config?: WebConfig;
  pwa_config?: PwaConfig;
  webhook_url?: string;
}

export interface ChannelUpdate {
  name?: string;
  status?: ChannelStatus;
  whatsapp_config?: Partial<WhatsAppConfig>;
  telegram_config?: Partial<TelegramConfig>;
  web_config?: Partial<WebConfig>;
  pwa_config?: Partial<PwaConfig>;
  webhook_url?: string;
}

export interface ChannelsResponse {
  success: boolean;
  channels: Channel[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ChannelResponse {
  success: boolean;
  channel: Channel;
  message?: string;
}

export interface ChannelFilters {
  page?: number;
  limit?: number;
  channel_type?: ChannelType | '';
  status?: ChannelStatus | '';
}
