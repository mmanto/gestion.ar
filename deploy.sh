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
#      ./deploy.sh all          (recorre core + todos los tenants, uno por uno)

set -euo pipefail

cd "$(dirname "$0")"

CORE_SERVICES=(app frontend)

usage() {
  cat <<EOF
Uso: ./deploy.sh <servicio|all>

Reconstruye y levanta servicios de producción (docker compose up -d --build).

Servicios core:
  app        backend (api.intellify.pro)
  frontend   panel admin (admin.intellify.pro)

Tenants (con dominio propio, ver docker-compose.tenants.prod.yml):
  <slug>     ej: ius, erma — despliega el service frontend-tenant-<slug>
             (tiene que existir ya ese service block en
             docker-compose.tenants.prod.yml)

all          detiene y reconstruye TODOS los contenedores (core + cada
             tenant definido en docker-compose.tenants.prod.yml), uno a
             la vez, reusando la misma lógica que un deploy individual.

Ejemplos:
  ./deploy.sh frontend
  ./deploy.sh ius
  ./deploy.sh all
EOF
}

# Despliega un único target (servicio core o slug de tenant). Misma lógica
# que antes usaba el script para su único caso de uso; ahora es una función
# para poder reusarla desde el modo "all" sin duplicar el flujo.
deploy_one() {
  local TARGET="$1"
  local COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)

  local SERVICE="$TARGET"
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
}

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

TARGET="$1"

# git pull antes de construir — requiere correr este script como el usuario
# con permisos de git (no root/sudo: docker no debería necesitar sudo si el
# usuario está en el grupo `docker`, ver setup del servidor). Si hay cambios
# locales sin commitear, aborta en vez de arriesgarse a perderlos con el pull.
echo "==> git pull"
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: hay cambios locales sin commitear en $(pwd) — abortando para no perderlos." >&2
  git status --short >&2
  exit 1
fi
git pull --ff-only

if [ "$TARGET" = "all" ]; then
  # Slugs de tenant = nombres de service en docker-compose.tenants.prod.yml
  # sin el prefijo "frontend-tenant-". Se descubren dinámicamente (no
  # hardcodeados) para que un tenant nuevo agregado a ese archivo entre
  # solo con este modo, sin tocar deploy.sh.
  TENANT_SLUGS=()
  while IFS= read -r svc; do
    TENANT_SLUGS+=("${svc#frontend-tenant-}")
  done < <(docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tenants.prod.yml config --services | grep '^frontend-tenant-')

  ALL_TARGETS=("${CORE_SERVICES[@]}" "${TENANT_SLUGS[@]}")
  echo "==> deploy 'all': ${ALL_TARGETS[*]}"

  for t in "${ALL_TARGETS[@]}"; do
    echo ""
    echo "########## $t ##########"
    deploy_one "$t"
  done
  exit 0
fi

deploy_one "$TARGET"
