import path from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// Remote de turnos servido por devbout-appointments (ver ADR-009 en
// docs/dev/DECISIONS.md). En dev web, .env.dev define
// VITE_APPOINTMENTS_REMOTE_URL=http://localhost:8180/remoteEntry.js (dev-server
// de frontend-widgets); los builds de Android (scripts/stack-*.sh) inyectan
// una URL alcanzable desde el dispositivo (host del backend + :8180 o un
// túnel). El fallback es la URL de prod para que un build sin env (p.ej.
// `vite build --mode capacitor`, que no carga .env.dev/.env.prod) no hornee
// un localhost inalcanzable dentro del APK. Mismo patrón que VITE_API_URL:
// valor baked en el bundle.
const appointmentsRemoteUrl = process.env.VITE_APPOINTMENTS_REMOTE_URL || 'https://appointments-widgets.intellify.pro/remoteEntry.js'

// Target del proxy /api y /ws: "app:8000" es el nombre del servicio dentro de
// la red de docker-compose (server dev). Si se corre `vite preview` fuera de
// docker (ej. para probar un build de producción vía ngrok/mobile, donde el
// modo dev sin bundlear es demasiado lento sobre un túnel), se puede
// sobreescribir con VITE_PROXY_TARGET=http://localhost:8000.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://app:8000'
const proxyConfig = {
  '/api': {
    target: proxyTarget,
    changeOrigin: true,
  },
  '/ws': {
    target: proxyTarget.replace(/^http/, 'ws'),
    ws: true,
    changeOrigin: true,
  },
}

// Sirve /tenant-config.js en el dev-server leyendo TENANT_ID/TENANT_SLUG del
// entorno del proceso — el equivalente de docker-entrypoint.sh pero sin
// escribir ningún archivo (bake-tenant-config.mjs ya advierte: nunca tocar
// public/, se filtraría a todos los tenants y a `npm run build`). Habilita
// hot-reload en docker-compose.tenants.dev.yml sin perder el tenant fijo por
// contenedor; si TENANT_ID no está seteado (dev local sin Docker), sirve un
// tenantId vacío y TenantContext cae al fallback ?tenant=<id> de siempre.
function tenantConfigDevMiddleware(): Plugin {
  return {
    name: 'tenant-config-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/tenant-config.js', (_req, res) => {
        const tenantId = process.env.TENANT_ID || ''
        const statsTwoColsMobile = process.env.STATS_TWO_COLS_MOBILE === 'true'
        res.setHeader('Content-Type', 'application/javascript')
        res.end(`window.__TENANT_CONFIG__ = { tenantId: ${JSON.stringify(tenantId)}, statsTwoColsMobile: ${statsTwoColsMobile} };\n`)
      })
    },
  }
}

// Puerto que el cliente de HMR usa para el websocket de vuelta al dev-server.
// En un `npm run dev` normal en el host, navegador y servidor comparten el
// puerto 5174 (default de abajo). Corriendo detrás de Traefik
// (docker-compose.tenants.dev.yml, dominios *.test en :80) el navegador
// entra por el 80, pero el 5174 del contenedor no está expuesto al host —
// forzar clientPort a 5174 ahí deja al websocket de HMR intentando conectar
// a un puerto inexistente (ERR_CONNECTION_REFUSED). VITE_HMR_CLIENT_PORT
// permite pisar ese puerto por entorno; sin setear, se mantiene el 5174 de
// siempre.
const hmrClientPort = Number(process.env.VITE_HMR_CLIENT_PORT) || 5174

// Puerto 5174 (distinto del frontend-admin en 5173) para poder correr ambas
// apps en paralelo durante desarrollo local.
export default defineConfig({
  plugins: [
    react(),
    tenantConfigDevMiddleware(),
    federation({
      name: 'gestionar-frontend-tenant',
      remotes: {
        appointments: {
          type: 'module',
          name: 'appointments',
          entry: appointmentsRemoteUrl,
          entryGlobalName: 'appointments',
          shareScope: 'default',
        },
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.2.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
        'date-fns': { singleton: true, requiredVersion: '^4.1.0' },
      },
    }),
  ],
  // .env.dev / .env.prod viven en la raíz del repo (npm run dev/build pasan
  // --mode dev / --mode prod).
  envDir: path.resolve(__dirname, '..'),
  server: {
    host: '0.0.0.0',
    port: 5174,
    hmr: {
      clientPort: hmrClientPort,
    },
    allowedHosts: true,
    proxy: proxyConfig,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    allowedHosts: true,
    proxy: proxyConfig,
  },
})
