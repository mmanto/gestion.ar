import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

/** Botón/gesto atrás de Android: navega hacia atrás en el historial si se
 * puede, o cierra la app si está en una pantalla raíz. No-op en web —
 * `Capacitor.isNativePlatform()` es false y el listener nunca se registra. */
export function useNativeBackButton(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      listenerPromise.then((sub) => sub.remove());
    };
  }, []);
}
