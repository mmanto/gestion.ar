# DEPLOYMENT.md — Guía de Deploy

---

## Entornos

| Entorno | URL | Compose | Deploy |
|---|---|---|---|
| Development | http://localhost:8000 | `docker-compose.yml` | `docker compose up -d` |
| Production | https://tudominio.com | `docker-compose.yml` + `docker-compose.prod.yml` | manual con aprobación |

---

## Primera vez en producción

```bash
# 1. Conectar al servidor
ssh deploy@<IP_SERVIDOR>

# 2. Clonar repositorio
git clone <repo-url> /opt/app && cd /opt/app

# 3. Configurar variables de entorno de producción
cp backend/.env.example backend/.env.prod
nano backend/.env.prod  # completar ANTHROPIC_API_KEY, SECRET_KEY, VAPID_*, etc.

# 4. Build y levantar
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 5. Verificar estado
docker compose ps
curl https://tudominio.com/api/health

# 6. Registrar webhooks de cada canal configurado (ver docs/dev/SETUP.md)
```

---

## Deploy de actualización

```bash
ssh deploy@<IP_SERVIDOR>
cd /opt/app

# Pull cambios
git pull origin main

# Rebuild servicios modificados
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend frontend

# Verificar que todo levantó
docker compose ps
docker compose logs --tail=50 backend
```

---

## Rollback

```bash
# Ver historial de imágenes Docker
docker images

# Volver a imagen anterior del backend
docker compose stop backend
docker tag backend:previous backend:latest
docker compose up -d backend
```

---

## Health checks

```bash
# Backend
curl https://tudominio.com/api/health

# Frontend
curl -I https://tudominio.com

# Estado de contenedores
docker compose ps

# Uso de recursos
docker stats
```

---

## Gestión de logs

```bash
# Logs del backend en tiempo real
docker compose logs -f backend

# Últimas 100 líneas de todos los servicios
docker compose logs --tail=100

# Logs con timestamps
docker compose logs -f --timestamps backend
```

---

## Comandos de mantenimiento

```bash
# Limpiar imágenes no usadas (liberar disco)
docker system prune -f

# Ver uso de disco de volúmenes
docker system df

# Reiniciar un servicio
docker compose restart backend

# Acceder al shell del backend
docker compose exec backend bash
```

---

## Variables de entorno en producción

Ver `ENV.md`. Las variables se setean en `backend/.env.prod` (no commiteado) y se pasan via Docker Compose.

```bash
# Editar variables en producción
nano /opt/app/backend/.env.prod

# Recrear containers con nuevas variables (sin rebuild de imagen)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## docker-compose.prod.yml (referencia)

```yaml
services:
  backend:
    env_file:
      - ./backend/.env.prod
    restart: unless-stopped

  frontend:
    restart: unless-stopped

  traefik:
    image: traefik:v3
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./infra/traefik:/etc/traefik
      - letsencrypt:/letsencrypt
    restart: unless-stopped

volumes:
  letsencrypt:
```

Ver `docker-compose.prod.yml` en la raíz del repositorio para la configuración completa.
