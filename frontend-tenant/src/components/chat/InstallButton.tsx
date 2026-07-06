import { useEffect, useState } from 'react';
import {
  type BeforeInstallPromptEvent,
  getPwaInstallPrompt,
  clearPwaInstallPrompt,
} from '../../hooks/pwaInstallPrompt';

const PWA_INSTALLED_KEY = 'pwa_installed';

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => getPwaInstallPrompt()
  );

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  useEffect(() => {
    if (isStandalone) return;

    const onReady = () => {
      const prompt = getPwaInstallPrompt();
      if (prompt) setDeferredPrompt(prompt);
    };
    const onInstalled = () => {
      localStorage.setItem(PWA_INSTALLED_KEY, '1');
      setDeferredPrompt(null);
    };
    window.addEventListener('pwa-install-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('pwa-install-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isStandalone]);

  // Solo mostrar si hay prompt nativo disponible
  if (isStandalone || !deferredPrompt) return null;

  const handleClick = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    clearPwaInstallPrompt();
    setDeferredPrompt(null);
    if (outcome === 'accepted') {
      localStorage.setItem(PWA_INSTALLED_KEY, '1');
    }
  };

  return (
    <div className="fixed bottom-32 right-4 z-40">
      <button
        onClick={handleClick}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        title="Instalar Asistente"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Instalar Asistente
      </button>
    </div>
  );
}
