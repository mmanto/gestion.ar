#!/bin/bash
# status.sh — estado de los contenedores + health checks.
#
# Uso: scripts/status.sh dev|prod
#
# No modifica nada: solo `docker compose ps` y curl a los health endpoints.

set -euo pipefail

STACK="${1:-}"
case "$STACK" in
  dev)
    ENV_FILE=".env.dev"
    COMPOSE=(docker compose --env-file "$ENV_FILE"
      -f docker-compose.yml -f docker-compose.dev.yml
      -f docker-compose.tenants.local.yml)
    if [ -f docker-compose.override.yml ]; then
      COMPOSE+=(-f docker-compose.override.yml)
    fi
    ;;
  prod)
    ENV_FILE=".env.prod"
    COMPOSE=(docker compose --env-file "$ENV_FILE"
      -f docker-compose.yml -f docker-compose.prod.yml
      -f docker-compose.tenants.prod.yml)
    ;;
  *)
    echo "Uso: $0 dev|prod" >&2
    exit 2
    ;;
esac

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: $ENV_FILE no encontrado.${NC}" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

echo -e "\n${CYAN}── Contenedores ──${NC}"
"${COMPOSE[@]}" ps

echo -e "\n${CYAN}── Health checks ──${NC}"

if [[ "$STACK" == "dev" ]]; then
  curl -sf -o /dev/null -w "app:       %{http_code}\n" http://localhost:8000/api/health \
    || echo -e "${RED}app:       sin respuesta${NC}"

  # Frontend — Vite dev server en 5173 (docker-compose.dev.yml).
  if "${COMPOSE[@]}" ps frontend --format json 2>/dev/null | grep -q '"State":"running"'; then
    curl -sf -o /dev/null -w "frontend:  %{http_code}\n" http://localhost:5173/ \
      || echo -e "${YELLOW}frontend:  sin respuesta${NC}"
  else
    echo -e "${YELLOW}frontend:  no esta corriendo${NC}"
  fi

  declare -A TENANT_DOMAINS=(
    ["erma"]="erma.com.test"
    ["ius"]="ius.mx.test"
    ["pachoteayuda"]="pachoteayuda.ar.localhost"
  )
  for tenant in "${!TENANT_DOMAINS[@]}"; do
    curl -sf -o /dev/null -w "tenant-${tenant}: %{http_code}\n" "http://${TENANT_DOMAINS[$tenant]}/" \
      || echo -e "${YELLOW}tenant-${tenant}: sin respuesta${NC}"
  done
else
  api_url="${WEBHOOK_BASE_URL:-https://api.intellify.pro}"
  frontend_url="${FRONTEND_URL:-https://admin.intellify.pro}"

  curl -sf -o /dev/null -w "api:       %{http_code}\n" "$api_url/api/health" \
    || echo -e "${RED}api:       sin respuesta${NC}"
  curl -sf -o /dev/null -w "frontend:  %{http_code}\n" "$frontend_url/" \
    || echo -e "${RED}frontend:  sin respuesta${NC}"

  declare -A TENANT_URLS=(
    ["erma"]="https://erma.com.ar"
    ["ius"]="https://ius.intellify.pro"
    ["laboralia"]="https://laboralia.intellify.pro"
    ["proptech"]="https://proptech.intellify.pro"
  )
  for tenant in "${!TENANT_URLS[@]}"; do
    curl -sf -o /dev/null -w "${tenant}: %{http_code}\n" "${TENANT_URLS[$tenant]}/" \
      || echo -e "${YELLOW}${tenant}: sin respuesta${NC}"
  done
fi
