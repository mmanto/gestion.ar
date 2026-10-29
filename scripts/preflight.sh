#!/bin/bash
# preflight.sh — valida el entorno antes de tocar Docker.
#
# Uso: scripts/preflight.sh dev|prod
#
# - dev:  exige .env.dev, crea la red traefik_public si falta y avisa si
#         faltan entradas en /etc/hosts para los dominios *.test.
# - prod: exige .env.prod y REGISTRY_IMAGE (sin él los tags del compose salen
#         inválidos), y crea la red traefik_public si falta.

set -euo pipefail

STACK="${1:-}"
case "$STACK" in
  dev)  ENV_FILE=".env.dev" ;;
  prod) ENV_FILE=".env.prod" ;;
  *)
    echo "Uso: $0 dev|prod" >&2
    exit 2
    ;;
esac

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: $ENV_FILE no encontrado.${NC}" >&2
  echo "Crealo desde .env.example con las credenciales de $STACK." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

if [[ "$STACK" == "prod" && -z "${REGISTRY_IMAGE:-}" ]]; then
  echo -e "${RED}ERROR: REGISTRY_IMAGE no está definido en $ENV_FILE.${NC}" >&2
  echo "Sin esto, docker compose arma tags invalidos (ej. \"/frontend:latest\")." >&2
  echo "Agregá algo como: REGISTRY_IMAGE=registry.gitlab.com/NAMESPACE/PROJECT." >&2
  exit 1
fi

if ! docker network inspect traefik_public &>/dev/null; then
  echo "Creando red traefik_public..."
  docker network create traefik_public
fi

# Los tenants sin dominio real usan dominios simulados *.test con entrada en
# /etc/hosts; los que tienen dominio propio usan <dominio>.localhost, que
# resuelve a loopback por RFC 6761 sin tocar /etc/hosts.
if [[ "$STACK" == "dev" ]]; then
  TENANTS=(erma ius pachoteayuda)
  declare -A TENANT_DOMAINS=(
    ["erma"]="erma.com.test"
    ["ius"]="ius.mx.test"
    ["pachoteayuda"]="pachoteayuda.ar.localhost"
  )
  missing=()
  for tenant in "${TENANTS[@]}"; do
    domain="${TENANT_DOMAINS[$tenant]}"
    [[ "$domain" == *.localhost ]] && continue
    if ! grep -qE "127\.0\.0\.1\s+${domain}" /etc/hosts 2>/dev/null; then
      missing+=("127.0.0.1 ${domain}")
    fi
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${YELLOW}==> Faltan entradas en /etc/hosts para dominios .test:${NC}"
    for entry in "${missing[@]}"; do
      echo -e "  ${RED}${entry}${NC}"
    done
    echo -e "${GREEN}  sudo sh -c 'echo \"127.0.0.1 erma.com.test\" >> /etc/hosts && echo \"127.0.0.1 ius.mx.test\" >> /etc/hosts'${NC}"
    echo ""
  fi
fi
