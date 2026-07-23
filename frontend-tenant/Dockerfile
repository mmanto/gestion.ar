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

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci

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

# Genera tenant-config.js a partir de $TENANT_ID en cada arranque del
# contenedor — la misma imagen sirve a cualquier tenant (ver docker-entrypoint.sh).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Exponer puerto 80
EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
