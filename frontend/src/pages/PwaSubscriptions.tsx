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
import { BellOff } from 'lucide-react';
import pwaService from '../services/pwa.service';
import type {
  PushSubscription,
  SendNotificationRequest,
  PwaStats,
} from '../types/pwa.types';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { Button } from '../components/common/Button';
import { useAccentTheme } from '../hooks/useAccentTheme';

export default function PwaSubscriptions() {
  const { accent } = useAccentTheme();
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
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/bots/${botId}/channels`)}
            className="text-gray-800 hover:text-gray-800 transition-colors"
            aria-label="Volver"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <PageHeader
            title="Suscripciones Push"
            description="Canal PWA — Notificaciones push (VAPID)"
            titleClassName="font-light uppercase tracking-[0.08em] text-2xl"
            descriptionClassName="text-gray-800"
          />
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Estadísticas */}
          {stats && (
            <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4">
                <p className="text-sm text-gray-900 uppercase tracking-wide">Suscriptores activos</p>
                <p className="text-3xl font-normal mt-1" style={{ color: accent }}>{stats.active_subscriptions}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4">
                <p className="text-sm text-gray-900 uppercase tracking-wide">Total histórico</p>
                <p className="text-3xl font-normal text-gray-800 mt-1">{stats.total_subscriptions}</p>
              </div>
            </div>
          )}

          {/* Formulario de envío */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-5">
              <h2 className="text-lg font-normal text-gray-900 mb-4">Enviar notificación</h2>
              <form onSubmit={handleSendNotification} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Título</label>
                  <input
                    type="text"
                    value={notifForm.title}
                    onChange={(e) => setNotifForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Mensaje</label>
                  <textarea
                    value={notifForm.body}
                    onChange={(e) => setNotifForm((f) => ({ ...f, body: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="Texto de la notificación..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">URL al hacer clic</label>
                  <input
                    type="text"
                    value={notifForm.url ?? ''}
                    onChange={(e) => setNotifForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="/chat/c/channel_xxx"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={isSending}
                  disabled={isSending || !notifForm.body.trim()}
                >
                  {isSending ? 'Enviando...' : 'Enviar a todos los suscriptores'}
                </Button>

                {sendResult && (
                  <Alert variant={sendResult.failed === 0 ? 'success' : 'info'} className="text-center">
                    Enviadas: {sendResult.sent} ✓ &nbsp;|&nbsp; Fallidas: {sendResult.failed}
                  </Alert>
                )}
              </form>
            </div>
          </div>

          {/* Lista de suscripciones */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-300">
                <h2 className="text-lg font-normal text-gray-900">
                  Suscriptores activos ({subscriptions.length})
                </h2>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center h-32">
                  <Spinner />
                </div>
              ) : subscriptions.length === 0 ? (
                <EmptyState
                  icon={<BellOff className="w-8 h-8 text-gray-800" />}
                  title="Aún no hay suscriptores"
                  description="Los visitantes que activen notificaciones aparecerán aquí"
                  titleClassName="text-gray-900 text-xl"
                  descriptionClassName="text-gray-900 text-base"
                />
              ) : (
                <div className="divide-y divide-gray-100">
                  {subscriptions.map((sub) => (
                    <div key={sub.subscription_id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono text-gray-900 truncate" title={sub.endpoint}>
                          {sub.endpoint.replace('https://', '').substring(0, 60)}...
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {sub.client_id && (
                            <span className="text-sm" style={{ color: accent }}>
                              Cliente vinculado
                            </span>
                          )}
                          {sub.last_used_at && (
                            <span className="text-sm text-gray-800">
                              Último uso:{' '}
                              {format(new Date(sub.last_used_at), 'dd/MM/yy HH:mm', { locale: es })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(sub.subscription_id)}
                        className="ml-3 flex-shrink-0 text-gray-400 hover:text-red-600 transition-colors"
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
      </div>
    </AppLayout>
  );
}
