import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Build del micro-frontend de autoregistro que va embebido en la landing
 * estática de ius (sites/ius-landing/registro.html). Produce UN archivo
 * `register-embed.js` (IIFE autocontenida) que se monta en `#register-root`.
 *
 * A diferencia de vite.config.ts no usa module-federation ni el dev-server:
 * es un bundle de publicación que se copia a sites/ius-landing/ y se sirve
 * por nginx desde la landing (ruta /register-embed.js, ver el router
 * landing-ius de docker-compose.tenants.prod.yml). Los estilos los aporta el
 * Tailwind CDN ya presente en la landing (el form usa solo clases/inline).
 *
 * Uso: npm run build:embed
 */
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '..'),
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/embed/registerEmbed.tsx'),
      name: 'RegisterEmbed',
      formats: ['iife'],
      fileName: () => 'register-embed.js',
    },
  },
})
