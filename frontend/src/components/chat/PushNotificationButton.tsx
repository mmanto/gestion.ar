/**
 * PushNotificationButton - Botón para suscribirse/desuscribirse de push notifications
 *
 * Se muestra en la interfaz de chat de un canal PWA.
 * Gestiona todo el ciclo de vida de la suscripción a través del hook usePushNotifications.
 */

import { usePushNotifications } from '../../hooks/usePushNotifications';

interface PushNotificationButtonProps {
  channelId: string;
  botId?: string;
}

export function PushNotificationButton({ channelId, botId }: PushNotificationButtonProps) {
  const {
    permissionState,
    isSubscribed,
    isLoading,
    subscribe,
  } = usePushNotifications(channelId, botId);

  // No mostrar si no soporta push, ya está suscrito, o está bloqueado (va a configuración)
  if (permissionState === 'unsupported' || permissionState === 'denied' || isSubscribed) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40">
      <button
        onClick={subscribe}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Activar notificaciones"
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        )}
        {isLoading ? 'Activando...' : 'Recibir notificaciones'}
      </button>
    </div>
  );
}
