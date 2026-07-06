/**
 * PWA Service - HTTP client para endpoints de Push Notifications (VAPID)
 */

import api from './api';
import type {
  PushSubscribeRequest,
  PushSubscribeResponse,
  NotificationResult,
  PwaStats,
  SubscriptionsResponse,
  SendNotificationRequest,
} from '../types/pwa.types';

const pwaService = {
  /**
   * Obtiene la clave pública VAPID del servidor.
   * El navegador la necesita para llamar a PushManager.subscribe().
   */
  async getVapidPublicKey(): Promise<string> {
    const response = await api.get<{ public_key: string }>('/pwa/vapid-public-key');
    return response.data.public_key;
  },

  /**
   * Registra una suscripción push del navegador en el servidor.
   */
  async subscribe(data: PushSubscribeRequest): Promise<PushSubscribeResponse> {
    const response = await api.post<PushSubscribeResponse>('/pwa/subscribe', data);
    return response.data;
  },

  /**
   * Desactiva una suscripción por su endpoint.
   */
  async unsubscribe(endpoint: string): Promise<void> {
    await api.delete('/pwa/unsubscribe', { data: { endpoint } });
  },

  /**
   * Envía una notificación push a los suscriptores de un bot.
   * Requiere JWT (solo el admin del bot).
   */
  async sendNotification(
    botId: string,
    payload: SendNotificationRequest
  ): Promise<NotificationResult> {
    const response = await api.post<NotificationResult>(
      `/pwa/${botId}/send-notification`,
      payload
    );
    return response.data;
  },

  /**
   * Lista las suscripciones activas de un bot (paginado).
   */
  async getSubscriptions(
    botId: string,
    page = 1,
    limit = 50
  ): Promise<SubscriptionsResponse> {
    const response = await api.get<SubscriptionsResponse>(
      `/pwa/${botId}/subscriptions`,
      { params: { page, limit } }
    );
    return response.data;
  },

  /**
   * Elimina permanentemente una suscripción (acción admin).
   */
  async deleteSubscription(botId: string, subscriptionId: string): Promise<void> {
    await api.delete(`/pwa/${botId}/subscriptions/${subscriptionId}`);
  },

  /**
   * Obtiene estadísticas de suscripciones de un bot.
   */
  async getStats(botId: string): Promise<PwaStats> {
    const response = await api.get<PwaStats>(`/pwa/${botId}/stats`);
    return response.data;
  },
};

export default pwaService;
