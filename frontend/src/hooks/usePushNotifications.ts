/**
 * usePushNotifications - Hook para gestionar suscripciones Web Push (VAPID)
 *
 * Ciclo de vida:
 *  1. Registrar Service Worker (/sw.js)
 *  2. Obtener clave pública VAPID del servidor
 *  3. Llamar a PushManager.subscribe() con la clave
 *  4. Enviar la suscripción al backend (POST /api/pwa/subscribe)
 *  5. Persistir subscription_id en localStorage
 */

import { useCallback, useEffect, useState } from 'react';
import pwaService from '../services/pwa.service';
import type { PushPermissionState } from '../types/pwa.types';

const STORAGE_KEY_PREFIX = 'pwa_sub_';

interface UsePushNotificationsReturn {
  permissionState: PushPermissionState;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

/** Convierte una clave pública VAPID de Base64 URL-safe a Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(
  channelId: string,
  botId?: string
): UsePushNotificationsReturn {
  const storageKey = `${STORAGE_KEY_PREFIX}${channelId}`;

  const [permissionState, setPermissionState] = useState<PushPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar: detectar soporte y estado actual
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermissionState('unsupported');
      return;
    }

    const currentPermission = Notification.permission as PushPermissionState;
    setPermissionState(currentPermission);

    // Verificar si ya tenemos una suscripción activa en localStorage
    const savedSubId = localStorage.getItem(storageKey);
    if (savedSubId && currentPermission === 'granted') {
      setIsSubscribed(true);
    }
  }, [storageKey]);

  /** Registra el Service Worker si no está registrado ya */
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration> => {
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existing) return existing;
    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }, []);

  /** Suscribirse a notificaciones push */
  const subscribe = useCallback(async () => {
    if (permissionState === 'unsupported') {
      setError('Tu navegador no soporta notificaciones push.');
      return;
    }
    if (permissionState === 'denied') {
      setError('Las notificaciones están bloqueadas. Habilítalas en la configuración del navegador.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Registrar Service Worker
      const registration = await registerServiceWorker();

      // 2. Obtener clave pública VAPID
      const vapidPublicKey = (await pwaService.getVapidPublicKey()).trim();
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      // 3. Solicitar permiso y suscribir
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      setPermissionState('granted');

      // 4. Enviar suscripción al backend (bot_id es opcional — se deriva del canal)
      const subJson = pushSubscription.toJSON();
      const response = await pwaService.subscribe({
        bot_id: botId,  // puede ser undefined; el backend lo deriva del canal
        channel_id: channelId,
        subscription: {
          endpoint: pushSubscription.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh ?? '',
            auth: subJson.keys?.auth ?? '',
          },
          expirationTime: pushSubscription.expirationTime ?? undefined,
        },
        user_agent: navigator.userAgent,
      });

      // 5. Persistir subscription_id
      localStorage.setItem(storageKey, response.subscription_id);
      setIsSubscribed(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al suscribirse';
      if (message.includes('permission') || message.includes('denied')) {
        setPermissionState('denied');
        setError('Permiso denegado. Habilita las notificaciones en tu navegador.');
      } else {
        setError(`No se pudo activar las notificaciones: ${message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [botId, channelId, permissionState, registerServiceWorker, storageKey]);

  /** Desuscribirse de notificaciones push */
  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Notificar al backend
          await pwaService.unsubscribe(subscription.endpoint);
          // Desuscribir en el navegador
          await subscription.unsubscribe();
        }
      }

      localStorage.removeItem(storageKey);
      setIsSubscribed(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al desuscribirse';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [storageKey]);

  return {
    permissionState,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
