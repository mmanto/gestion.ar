#!/bin/bash
# deploy.sh — deploy de producción (api.intellify.pro + admin.intellify.pro
# + tenants con dominio propio), un servicio a la vez.
#
# Existe porque un deploy manual sin los "-f" correctos rompió producción
# varias veces (docker-compose.prod.yml es el que trae los labels de
# Traefik de intellify.pro y las credenciales de .env.prod — sin él, los
# contenedores levantan con la config vieja/dev y Traefik responde 404).
#
# También pasa --env-file .env.prod: ese archivo (raíz del repo, no
# commiteado) trae REGISTRY_IMAGE/DB_USER/DB_PASSWORD/DB_NAME/VITE_API_URL/
# TENANT_ID_<SLUG>, necesarios para la sustitución ${...} del propio YAML —
# sin el flag, Docker Compose solo autocarga un archivo llamado ".env" a secas.
#
# Uso: ./deploy.sh <servicio>   (desde cualquier lado, se ubica solo)

set -euo pipefail

cd "$(dirname "$0")"

CORE_SERVICES=(app frontend)

usage() {
  cat <<EOF
Uso: ./deploy.sh <servicio>

Reconstruye y levanta UN servicio de producción (docker compose up -d --build <servicio>).
No hace deploy de todo el stack a la vez.

Servicios core:
  app        backend (api.intellify.pro)
  frontend   panel admin (admin.intellify.pro)

Tenants (con dominio propio, ver docker-compose.tenants.prod.yml):
  <slug>     ej: ius, erma — despliega el service frontend-tenant-<slug>
             (tiene que existir ya ese service block en
             docker-compose.tenants.prod.yml)

Ejemplos:
  ./deploy.sh frontend
  ./deploy.sh ius
EOF
}

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

TARGET="$1"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)

SERVICE="$TARGET"
for core in "${CORE_SERVICES[@]}"; do
  if [ "$TARGET" = "$core" ]; then
    SERVICE="$TARGET"
    break
  fi
  SERVICE="frontend-tenant-$TARGET"
done

if [[ "$SERVICE" == frontend-tenant-* ]]; then
  COMPOSE_FILES+=(-f docker-compose.tenants.prod.yml)
fi

if ! docker compose --env-file .env.prod "${COMPOSE_FILES[@]}" config --services | grep -qx "$SERVICE"; then
  echo "Error: el servicio '$SERVICE' no existe en los compose files." >&2
  echo "Servicios disponibles:" >&2
  docker compose --env-file .env.prod "${COMPOSE_FILES[@]}" config --services >&2
  exit 1
fi

echo "==> docker compose up (${COMPOSE_FILES[*]}) — servicio: $SERVICE"
docker compose --env-file .env.prod "${COMPOSE_FILES[@]}" up -d --build "$SERVICE"

echo "==> esperando a que levante..."
sleep 10

echo "==> estado del contenedor"
docker compose --env-file .env.prod "${COMPOSE_FILES[@]}" ps "$SERVICE"

echo "==> health check"
case "$SERVICE" in
  app)
    curl -s -o /dev/null -w "api.intellify.pro:   %{http_code}\n" https://api.intellify.pro/api/health || echo "api.intellify.pro:   sin respuesta"
    ;;
  frontend)
    curl -s -o /dev/null -w "admin.intellify.pro: %{http_code}\n" https://admin.intellify.pro/ || echo "admin.intellify.pro: sin respuesta"
    ;;
  frontend-tenant-*)
    # Convención de subdominio propio (ver docker-compose.tenants.prod.yml);
    # si el tenant usa dominio propio del cliente esto no aplica, chequear a mano.
    DOMAIN="${TARGET}.intellify.pro"
    curl -s -o /dev/null -w "$DOMAIN: %{http_code}\n" "https://$DOMAIN/" || echo "$DOMAIN: sin respuesta"
    ;;
esac
