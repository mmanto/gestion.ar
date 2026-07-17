import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../services/api';
import botsService from '../services/bots.service';

async function submitToken(token: string): Promise<void> {
  const { bots } = await botsService.getBots({ limit: 100, status: 'active' });
  const bot = bots[0];
  if (!bot) return;

  await api.post('/pwa/subscribe-staff', {
    platform: Capacitor.getPlatform() === 'ios' ? 'apns' : 'fcm',
    bot_id: bot.bot_id,
    device_token: token,
    user_agent: `Capacitor/${Capacitor.getPlatform()}`,
  });
}

/** Registra el push token nativo (FCM en Android, APNs en iOS) del staff
 * logueado contra el primer bot activo del tenant, para recibir
 * notificaciones cuando un cliente le escribe. No-op en web —
 * `Capacitor.isNativePlatform()` es false y nunca se registra nada.
 *
 * Los listeners se enganchan siempre al montar (no atados a isAuthenticated):
 * Firebase puede generar el token nativo apenas arranca la app, incluso
 * antes de que se otorgue el permiso de notificaciones o de que el usuario
 * haya iniciado sesión — si esperáramos a isAuthenticated para hacer el
 * addListener, se pierde ese primer evento ("No listeners found for event
 * registration" en el log nativo). El token capturado se guarda en un ref y
 * se envía al backend recién cuando isAuthenticated pasa a true. */
export function useNativeStaffPush(isAuthenticated: boolean): void {
  const isAuthenticatedRef = useRef(isAuthenticated);
  const pendingTokenRef = useRef<string | null>(null);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const registrationSub = PushNotifications.addListener('registration', (token) => {
      if (isAuthenticatedRef.current) {
        submitToken(token.value).catch((err) => console.error('Error enviando push token:', err));
      } else {
        // Todavía no hay sesión (ej. token nativo generado en Login) — se
        // envía apenas isAuthenticated pase a true (ver efecto de abajo).
        pendingTokenRef.current = token.value;
      }
    });

    const errorSub = PushNotifications.addListener('registrationError', (err) => {
      console.error('Error registrando push nativo:', err);
    });

    return () => {
      registrationSub.then((sub) => sub.remove());
      errorSub.then((sub) => sub.remove());
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isAuthenticated) return;

    if (pendingTokenRef.current) {
      const token = pendingTokenRef.current;
      pendingTokenRef.current = null;
      submitToken(token).catch((err) => console.error('Error enviando push token pendiente:', err));
    }

    (async () => {
      const permission = await PushNotifications.checkPermissions();
      let granted = permission.receive === 'granted';
      if (!granted && permission.receive !== 'denied') {
        const requested = await PushNotifications.requestPermissions();
        granted = requested.receive === 'granted';
      }
      if (!granted) return;

      await PushNotifications.register();
    })();
  }, [isAuthenticated]);
}
