/**
 * gestion.ar Service Worker
 * Gestiona:
 *  1. Cache offline (shell caching de la SPA)
 *  2. Notificaciones push (Web Push / VAPID)
 *  3. Clic en notificación → abrir URL del chat
 */

const CACHE_NAME = 'ius-pwa-v2';

// Assets de la shell de la aplicación a pre-cachear en install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cachear shell ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        // Si algún asset falla (ej. iconos aún no generados), continuar de todas formas
        console.warn('[SW] Error pre-cacheando algunos assets:', err);
      });
    })
  );
  // Activar inmediatamente sin esperar a que la pestaña se cierre
  self.skipWaiting();
});

// ── Activate: limpiar caches viejas y tomar control ──────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Tomar control de todas las pestañas abiertas inmediatamente
  self.clients.claim();
});

// ── Fetch: estrategia cache-first para assets, network-first para API ─────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar requests a la API ni WebSocket
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
    return;
  }

  // No interceptar módulos internos de Vite (dev server HMR, transforms, etc.)
  if (
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@id/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // Para navegación (HTML) y assets estáticos: cache-first con fallback a network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          // Solo cachear respuestas exitosas de GET
          if (
            networkResponse.ok &&
            request.method === 'GET' &&
            !url.pathname.startsWith('/sw.js')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback: devolver index.html para rutas SPA
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// ── Push: mostrar notificación ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {
    title: 'gestion.ar',
    body: 'Tienes un nuevo mensaje',
    url: '/',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = { ...payload, ...data };
    } catch {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    vibrate: [200, 100, 200],
    data: { url: payload.url },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Cerrar' },
    ],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// ── NotificationClick: navegar a la URL del chat ──────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Convertir URL relativa a absoluta para que navigate() y openWindow() funcionen
  const rawUrl = event.notification.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una ventana abierta en exactamente esa URL, solo enfocarla
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Abrir la URL en una nueva pestaña/ventana (o reutilizar una existente)
        return self.clients.openWindow(targetUrl);
      })
  );
});
