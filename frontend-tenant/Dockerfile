# syntax=docker/dockerfile:1
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Build argument para la URL del API
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Build argument para el remote de Module Federation de devbout-appointments
# (ver ADR-009). Sin esto queda baked el default de vite.config.ts
# (localhost:5180, el dev-server standalone que no corre en este entorno).
ARG VITE_APPOINTMENTS_REMOTE_URL
ENV VITE_APPOINTMENTS_REMOTE_URL=${VITE_APPOINTMENTS_REMOTE_URL}

# Build arguments para el login social (Google/Microsoft vía Nango) — URLs
# públicas que llama el browser (Connect UI + API de Nango), distintas de
# NANGO_HOST del backend (ese es interno, red Docker). Sin esto el bundle de
# prod cae al fallback hardcodeado localhost:3009/localhost:3003 en
# auth.service.ts, que no resuelve fuera de un entorno de desarrollo local.
ARG VITE_NANGO_CONNECT_URL
ENV VITE_NANGO_CONNECT_URL=${VITE_NANGO_CONNECT_URL}
ARG VITE_NANGO_API_URL
ENV VITE_NANGO_API_URL=${VITE_NANGO_API_URL}

# Copiar package.json y package-lock.json
COPY package*.json ./

# Reintentos de red: el build corre en el VPS de prod, donde el registry
# corta conexiones de forma intermitente (ver más abajo).
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# Instalar dependencias.
#
# --maxsockets 1000 NO es tuning: npm 10.x/11.x arrastra un bug en
# agent-base (npm/cli#9386) por el que las descargas que quedan en cola
# detrás de maxsockets (default 15) nunca arrancan cuando una conexión
# falla — sus promesas no se resuelven, npm se queda sin event loop y muere
# con "npm error Exit handler never called!" SIN imprimir el error real.
# Con maxsockets por encima del tamaño del árbol cada fetch falla rápido y
# el build muestra el ETIMEDOUT/ENOTFOUND verdadero.
# Reproducido en node:22-alpine (npm 10.9.9) contra un registry inalcanzable.
#
# --no-audit/--no-fund: el POST de audit es otro request al registry que no
# aporta nada en el build y puede colgarse en la misma red.
RUN --mount=type=cache,id=npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --maxsockets 1000 --no-audit --no-fund

# Copiar el resto del código
COPY . .

# Build de producción
RUN npm run build

# Stage 2: Production con Nginx
FROM nginx:1.25-alpine

# Copiar configuración de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos build desde la etapa anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# Entrypoint exec-only: el tenant se resuelve por Host (no por env por
# contenedor); ver docker-entrypoint.sh y nginx.conf (map $tenant_icon_slug).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Exponer puerto 80
EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
