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

// Puerto 5174 (distinto del frontend-admin en 5173) para poder correr ambas

// Construir para Capacitor (app nativa)? El build de Capacitor necesita
// base: './' (rutas relativas, carga desde file://). El build PWA/web
// sigue usando base: '/'.
const isCapacitor = process.env.CAPACITOR_BUILD === '1'
// VITE_TARGET define qué shell cargar: "staff" | "client"
const target = process.env.VITE_TARGET || 'staff'
const outDir = `dist-${target}`

export default defineConfig({
  plugins: [react()],
  base: isCapacitor ? './' : '/',
  envDir: path.resolve(__dirname, '..'),
  define: {
    __TARGET__: JSON.stringify(target),
    __CAPACITOR__: JSON.stringify(isCapacitor),
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    hmr: { clientPort: 5174 },
    allowedHosts: true,
    proxy: proxyConfig,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    allowedHosts: true,
    proxy: proxyConfig,
  },
  build: {
    outDir,
  },
})
