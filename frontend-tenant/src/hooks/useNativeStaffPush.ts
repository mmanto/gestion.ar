import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
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

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

// Espera a que la Activity esté resumida y en foco antes de pedir el permiso
// de notificaciones. El permiso es un diálogo de runtime de Android: si el
// request cae en la ventana de retorno del Chrome Custom Tab del login con
// Google (cuando la Activity todavía está resolviendo el resume), en algunos
// equipos el diálogo del sistema queda detrás o se pierde la respuesta, y el
// usuario percibe que "el login no funciona". Al exigir estar en foco, el
// pedido sale siempre de una Activity resumida → el diálogo aparece SIEMPRE
// en primer plano. Resuelve true si llegó a estar en foco antes del timeout
// (aunque si no, se continúa de todos modos, sin bloquear nada).
const APP_FOCUS_WAIT_MS = 4000;
// Margen adicional tras el foco para que la navegación post-login (dashboard)
// y el WebView se asienten antes del prompt — evita competir con transiciones.
const PERMISSION_SETTLE_MS = 1500;

async function waitAppActive(timeoutMs: number): Promise<boolean> {
  try {
    const { isActive } = await App.getState();
    if (isActive) return true;
  } catch {
    // App plugin no disponible (web) — se continúa con el flujo normal.
  }

  const { promise, resolve } = Promise.withResolvers<boolean>();
  const sub = App.addListener('appStateChange', (state) => {
    if (state.isActive) resolve(true);
  });
  const timer = setTimeout(() => resolve(false), timeoutMs);
  const settled = await promise;
  sub.then((l) => l.remove());
  clearTimeout(timer);
  return settled;
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
 * se envía al backend recién cuando isAuthenticated pasa a true.
 *
 * El pedido del permiso NO se hace en el instante en que isAuthenticated
 * cambia (coincide con el fin del login con Google): se difiere hasta que la
 * app está en foco y asentada (ver waitAppActive/PERMISSION_SETTLE_MS) para
 * que el diálogo del sistema salga siempre en primer plano y nunca parezca
 * que el login se cortó. El flujo del login no depende de esto. */
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

    let cancelled = false;

    if (pendingTokenRef.current) {
      const token = pendingTokenRef.current;
      pendingTokenRef.current = null;
      submitToken(token).catch((err) => console.error('Error enviando push token pendiente:', err));
    }

    (async () => {
      try {
        // Difiere el prompt fuera de la ventana de retorno del Custom Tab del
        // login: primero foco de la Activity, luego margen de asentamiento.
        const active = await waitAppActive(APP_FOCUS_WAIT_MS);
        if (cancelled) return;
        if (active) await delay(PERMISSION_SETTLE_MS);
        if (cancelled) return;

        const permission = await PushNotifications.checkPermissions();
        if (permission.receive === 'denied') return;

        let granted = permission.receive === 'granted';
        if (!granted) {
          granted = (await PushNotifications.requestPermissions()).receive === 'granted';
        }
        if (!granted || cancelled) return;

        await PushNotifications.register();
      } catch (err) {
        // Un request fallido/rechazado en un equipo puntual NUNCA debe colgar
        // la app ni percibirse como un fallo del login (que ya terminó para
        // entonces): se loguea y se sigue. El usuario puede habilitarlo desde
        // los ajustes del sistema si lo desea.
        console.error('Error al solicitar permiso de notificaciones:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
}