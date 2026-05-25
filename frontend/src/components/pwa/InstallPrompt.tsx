/**
 * InstallPrompt - Banner para instalar la PWA en el dispositivo
 *
 * Escucha el evento `beforeinstallprompt` (Chrome/Edge/Android).
 * En iOS/Safari muestra un mensaje para "Agregar a pantalla de inicio".
 * Se descarta permanentemente y persiste en localStorage.
 */

import { useEffect, useState } from 'react';
import {
  type BeforeInstallPromptEvent,
  getPwaInstallPrompt,
  clearPwaInstallPrompt,
} from '../../hooks/pwaInstallPrompt';

const DISMISS_KEY = 'pwa_install_dismissed';

interface InstallPromptProps {
  /** Si es true, ignora el dismiss guardado en localStorage (útil en páginas de chat) */
  ignoreDismiss?: boolean;
}

function canShowPrompt(ignoreDismiss: boolean): boolean {
  if (!ignoreDismiss && localStorage.getItem(DISMISS_KEY)) return false;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !isStandalone;
}

const isIosDevice = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

export function InstallPrompt({ ignoreDismiss = false }: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (!canShowPrompt(ignoreDismiss) || isIosDevice) return null;
    return getPwaInstallPrompt();
  });
  const [showIosHint] = useState(() => canShowPrompt(ignoreDismiss) && isIosDevice);
  const [visible, setVisible] = useState(() => {
    if (!canShowPrompt(ignoreDismiss)) return false;
    if (isIosDevice) return true;
    return !!getPwaInstallPrompt();
  });

  useEffect(() => {
    if (!canShowPrompt(ignoreDismiss)) return;

    const markInstalled = () => {
      setVisible(false);
    };

    if (isIosDevice) {
      window.addEventListener('appinstalled', markInstalled);
      return () => window.removeEventListener('appinstalled', markInstalled);
    }

    // Escuchar si llega un prompt después de montar
    const onReady = () => {
      const prompt = getPwaInstallPrompt();
      if (prompt) {
        setDeferredPrompt(prompt);
        setVisible(true);
      }
    };

    window.addEventListener('pwa-install-ready', onReady);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('pwa-install-ready', onReady);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, [ignoreDismiss]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      clearPwaInstallPrompt();
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <div className="bg-white rounded-xl shadow-lg border border-indigo-100 p-4 flex items-start gap-3">
        <img
          src="/img/logo_vertical_ius.svg"
          alt="gestion.ar"
          className="w-12 h-12 rounded-xl flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          {showIosHint ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Instala Asistente</p>
              <p className="text-xs text-gray-500 mt-1">
                Toca{' '}
                <span className="font-medium">Compartir</span>
                {' '}→{' '}
                <span className="font-medium">"Agregar a pantalla de inicio"</span>
                {' '}para activar notificaciones.
              </p>
            </>
          ) : deferredPrompt ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Instala Asistente</p>
              <p className="text-xs text-gray-500 mt-1">
                Instala la app para recibir notificaciones y acceder más rápido.
              </p>
              <button
                onClick={handleInstall}
                className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Instalar ahora
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900">Instala Asistente</p>
              <p className="text-xs text-gray-500 mt-1">
                Tocá el menú del navegador{' '}
                <span className="font-medium">(⋮)</span>
                {' '}y elegí{' '}
                <span className="font-medium">"Instalar app"</span>
                {' '}o{' '}
                <span className="font-medium">"Agregar a pantalla de inicio"</span>.
              </p>
            </>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cerrar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
