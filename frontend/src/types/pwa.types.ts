/**
 * PWA / Push Notifications types
 */

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionInfo {
  endpoint: string;
  keys: PushSubscriptionKeys;
  expirationTime?: number | null;
}

export interface PushSubscribeRequest {
  bot_id?: string;
  channel_id: string;
  subscription: PushSubscriptionInfo;
  user_agent?: string;
}

export interface PushSubscribeResponse {
  success: boolean;
  subscription_id: string;
  public_key: string;
}

export interface PushSubscription {
  subscription_id: string;
  bot_id: string;
  channel_id: string;
  client_id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
  expiration_time?: number;
}

export interface SendNotificationRequest {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  client_id?: string;
}

export interface NotificationResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}

export interface PwaStats {
  success: boolean;
  total_subscriptions: number;
  active_subscriptions: number;
}

export interface SubscriptionsResponse {
  success: boolean;
  subscriptions: PushSubscription[];
  total: number;
  page: number;
  limit: number;
}

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';
