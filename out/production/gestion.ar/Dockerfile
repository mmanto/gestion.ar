# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Build argument para la URL del API y el target de la app (staff | client)
ARG VITE_API_URL=/api
ARG VITE_TARGET=staff
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_TARGET=${VITE_TARGET}

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar el resto del codigo
COPY . .

# Build de produccion. vite.config.ts lee VITE_TARGET del entorno y
# escribe en dist-${VITE_TARGET} (dist-staff o dist-client).
# Creamos symlink /app/dist para que el COPY del stage 2 lo encuentre.
RUN npm run build && ln -s dist-${VITE_TARGET} /app/dist

# Stage 2: Production con Nginx
FROM nginx:1.25-alpine

# Copiar configuracion de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos build desde la etapa anterior (/app/dist → symlink a dist-staff o dist-client)
COPY --from=builder /app/dist /usr/share/nginx/html
# Genera tenant-config.js a partir de $TENANT_ID en cada arranque del
# contenedor — la misma imagen sirve a cualquier tenant (ver docker-entrypoint.sh).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Exponer puerto 80
EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
