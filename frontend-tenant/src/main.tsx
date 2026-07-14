import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setPwaInstallPrompt } from './hooks/pwaInstallPrompt'

// ── Tipo build-time inyectado por vite.config.ts (define.__TARGET__) ─────────
declare const __TARGET__: 'staff' | 'client'

// ── PWA: capturar beforeinstallprompt lo antes posible ──────────────────────
// Chrome puede disparar este evento antes de que los componentes React monten.
// Lo almacenamos en un módulo global para que los componentes lo lean al montar.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  setPwaInstallPrompt(e)
  window.dispatchEvent(new CustomEvent('pwa-install-ready'))
})

// Service Worker: solo en PWA web, no en Capacitor (nativo)
if ('serviceWorker' in navigator && __TARGET__ === 'client') {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
    console.warn('[SW] Registro fallido:', err)
  })
}

// Capacitor: polyfill mínimo de entorno nativo (status bar, safe areas, teclado)
if (import.meta.env.CAPACITOR_BUILD === '1') {
  import('./capacitor/setup').catch(() => {
    // setup de Capacitor es opcional en web/PWA
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App target={__TARGET__} />
  </StrictMode>,
)
