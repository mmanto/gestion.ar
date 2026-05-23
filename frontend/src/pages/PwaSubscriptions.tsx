/**
 * PwaSubscriptions - Página admin para gestionar suscripciones push de un canal PWA
 *
 * Muestra lista de suscriptores activos y permite enviar notificaciones push.
 * Accesible desde: /bots/:botId/pwa/:channelId
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import pwaService from '../services/pwa.service';
import type {
  PushSubscription,
  SendNotificationRequest,
  PwaStats,
} from '../types/pwa.types';
import { AppLayout } from '../components/layout/AppLayout';

export default function PwaSubscriptions() {
  const { botId, channelId } = useParams<{ botId: string; channelId: string }>();
  const navigate = useNavigate();

  const [subscriptions, setSubscriptions] = useState<PushSubscription[]>([]);
  const [stats, setStats] = useState<PwaStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  const [notifForm, setNotifForm] = useState<SendNotificationRequest>({
    title: 'Asistente',
    body: '',
    url: channelId ? `/chat/c/${channelId}` : '/',
  });

  useEffect(() => {
    if (!botId) return;
    loadData();
  }, [botId]);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [subsData, statsData] = await Promise.all([
        pwaService.getSubscriptions(botId!, 1, 100),
        pwaService.getStats(botId!),
      ]);
      setSubscriptions(subsData.subscriptions);
      setStats(statsData);
    } catch {
      setError('Error cargando suscripciones');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!botId || !notifForm.body.trim()) return;

    setIsSending(true);
    setSendResult(null);
    try {
      const result = await pwaService.sendNotification(botId, notifForm);
      setSendResult({ sent: result.sent, failed: result.failed });
    } catch {
      setError('Error enviando notificación');
    } finally {
      setIsSending(false);
    }
  }

  async function handleDelete(subscriptionId: string) {
    if (!botId) return;
    try {
      await pwaService.deleteSubscription(botId, subscriptionId);
      setSubscriptions((prev) => prev.filter((s) => s.subscription_id !== subscriptionId));
    } catch {
      setError('Error eliminando suscripción');
    }
  }

  return (
    <AppLayout>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/bots/${botId}/channels`)}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Volver"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Suscripciones Push</h1>
            <p className="text-sm text-gray-500">Canal PWA — Notificaciones push (VAPID)</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Estadísticas */}
          {stats && (
            <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Suscriptores activos</p>
                <p className="text-3xl font-bold text-indigo-600 mt-1">{stats.active_subscriptions}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total histórico</p>
                <p className="text-3xl font-bold text-gray-700 mt-1">{stats.total_subscriptions}</p>
              </div>
            </div>
          )}

          {/* Formulario de envío */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Enviar notificación</h2>
              <form onSubmit={handleSendNotification} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Título</label>
                  <input
                    type="text"
                    value={notifForm.title}
                    onChange={(e) => setNotifForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mensaje</label>
                  <textarea
                    value={notifForm.body}
                    onChange={(e) => setNotifForm((f) => ({ ...f, body: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="Texto de la notificación..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">URL al hacer clic</label>
                  <input
                    type="text"
                    value={notifForm.url ?? ''}
                    onChange={(e) => setNotifForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="/chat/c/channel_xxx"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSending || !notifForm.body.trim()}
                  className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isSending ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    'Enviar a todos los suscriptores'
                  )}
                </button>

                {sendResult && (
                  <div className={`text-xs text-center rounded-lg py-2 px-3 ${sendResult.failed === 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                    Enviadas: {sendResult.sent} ✓ &nbsp;|&nbsp; Fallidas: {sendResult.failed}
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Lista de suscripciones */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">
                  Suscriptores activos ({subscriptions.length})
                </h2>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p className="text-sm">Aún no hay suscriptores</p>
                  <p className="text-xs mt-1">Los visitantes que activen notificaciones aparecerán aquí</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {subscriptions.map((sub) => (
                    <div key={sub.subscription_id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-gray-500 truncate" title={sub.endpoint}>
                          {sub.endpoint.replace('https://', '').substring(0, 60)}...
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {sub.client_id && (
                            <span className="text-xs text-indigo-600">
                              Cliente vinculado
                            </span>
                          )}
                          {sub.last_used_at && (
                            <span className="text-xs text-gray-400">
                              Último uso:{' '}
                              {format(new Date(sub.last_used_at), 'dd/MM/yy HH:mm', { locale: es })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(sub.subscription_id)}
                        className="ml-3 flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                        aria-label="Eliminar suscripción"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
    </AppLayout>
  );
}
