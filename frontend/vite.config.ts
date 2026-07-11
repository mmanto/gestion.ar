import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
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
