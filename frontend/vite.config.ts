import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// Remote de turnos servido por devbout-appointments (ver ADR-009 en
// docs/dev/DECISIONS.md) — en dev apunta al vite dev-server de
// frontend-widgets (puerto propio 5180), en prod al remoteEntry.js
// deployado detrás de Traefik. Mismo patrón que VITE_API_URL: build ARG
// baked en el bundle.
const appointmentsRemoteUrl = process.env.VITE_APPOINTMENTS_REMOTE_URL || 'http://localhost:5180/remoteEntry.js'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'gestionar-frontend',
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
        'react-router-dom': { singleton: true, requiredVersion: '^7.11.0' },
      },
    }),
  ],
  // .env.dev / .env.prod viven en la raíz del repo (npm run dev/build pasan
  // --mode dev / --mode prod). Solo aplica fuera de Docker: en docker-compose
  // las vars ya llegan como process.env vía env_file, sin pasar por archivos.
  envDir: path.resolve(__dirname, '..'),
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      clientPort: 5173,
    },
    allowedHosts: true,
    proxy: proxyConfig,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy: proxyConfig,
  },
})
