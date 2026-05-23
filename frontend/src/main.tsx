import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setPwaInstallPrompt } from './hooks/pwaInstallPrompt';

// ── PWA: capturar beforeinstallprompt lo antes posible ──────────────────────
// Chrome puede disparar este evento antes de que los componentes React monten.
// Lo almacenamos en un módulo global para que los componentes lo lean al montar.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  setPwaInstallPrompt(e);
  window.dispatchEvent(new CustomEvent('pwa-install-ready'));
});

// Registrar Service Worker inmediatamente (no esperar 'load') para que Chrome
// lo encuentre activo cuando evalúa la instalabilidad PWA.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
    console.warn('[SW] Registro fallido:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
