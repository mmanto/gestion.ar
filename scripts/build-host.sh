#!/bin/bash
# build-host.sh — build con la red/DNS del host.
#
# Uso: scripts/build-host.sh dev|prod [app|frontend|frontend-tenant|landing]
#
# Es el fallback cuando el DNS del daemon de Docker está roto (net-check falla):
# `docker build --network=host` usa el resolver del host y evita el puente
# interno de Docker. No usa Compose Bake (BuildKit no permite network.host por
# esa vía sin --allow), así que construye secuencialmente.

set -euo pipefail

STACK="${1:-}"
SERVICE="${2:-}"

case "$STACK" in
  dev)  ENV_FILE=".env.dev" ;;
  prod) ENV_FILE=".env.prod" ;;
  *)
    echo "Uso: $0 dev|prod [app|frontend|frontend-tenant|landing]" >&2
    exit 2
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE no encontrado." >&2
  exit 1
fi
# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

IMAGE_TAG="${IMAGE_TAG:-latest}"

build_app() {
  echo "==> app ($STACK)"
  if [[ "$STACK" == "dev" ]]; then
    docker build --network=host --target dev \
      --build-arg BAKE_EMBEDDING_MODEL=0 \
      --build-arg HF_OFFLINE=0 \
      -t gestionar-app backend
  else
    : "${REGISTRY_IMAGE:?REGISTRY_IMAGE no definido en $ENV_FILE}"
    docker build --network=host --target prod \
      -t "${REGISTRY_IMAGE}/backend:${IMAGE_TAG}" backend
  fi
}

build_frontend() {
  echo "==> frontend ($STACK)"
  if [[ "$STACK" == "dev" ]]; then
    docker build --network=host -f frontend/Dockerfile.dev \
      -t gestionar-frontend frontend
  else
    : "${REGISTRY_IMAGE:?REGISTRY_IMAGE no definido en $ENV_FILE}"
    docker build --network=host \
      --build-arg "VITE_API_URL=${VITE_API_URL:-/api}" \
      --build-arg "VITE_APPOINTMENTS_REMOTE_URL=${VITE_APPOINTMENTS_REMOTE_URL:-https://appointments-widgets.intellify.pro/remoteEntry.js}" \
      --build-arg "VITE_NANGO_CONNECT_URL=https://nango.intellify.pro" \
      --build-arg "VITE_NANGO_API_URL=https://api.nango.intellify.pro" \
      -t "${REGISTRY_IMAGE}/frontend:${IMAGE_TAG}" frontend
  fi
}

build_frontend_tenant() {
  echo "==> frontend-tenant ($STACK)"
  if [[ "$STACK" == "dev" && "${TENANT_HOT_RELOAD:-}" == "1" ]]; then
    docker build --network=host -f frontend-tenant/Dockerfile.dev \
      -t gestionar-frontend-tenant frontend-tenant
    return
  fi
  docker build --network=host \
    --build-arg "VITE_TARGET=staff" \
    --build-arg "VITE_APPOINTMENTS_REMOTE_URL=${VITE_APPOINTMENTS_REMOTE_URL:-https://appointments-widgets.intellify.pro/remoteEntry.js}" \
    --build-arg "VITE_NANGO_CONNECT_URL=https://nango.intellify.pro" \
    --build-arg "VITE_NANGO_API_URL=https://api.nango.intellify.pro" \
    -t gestionar-frontend-tenant frontend-tenant
}

build_landing() {
  echo "==> landing ($STACK)"
  docker build --network=host -t gestionar-landing sites
}

case "$SERVICE" in
  "")               build_app; build_frontend; build_frontend_tenant; build_landing ;;
  app)              build_app ;;
  frontend)         build_frontend ;;
  frontend-tenant)  build_frontend_tenant ;;
  landing)          build_landing ;;
  *)
    echo "ERROR: servicio '$SERVICE' no válido (app|frontend|frontend-tenant|landing)." >&2
    exit 2
    ;;
esac

echo "==> Build host-network completo."
