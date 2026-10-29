#!/bin/bash
# clean.sh — limpieza de recursos Docker y artefactos de build.
#
# Uso: scripts/clean.sh dev|prod [light|deep|all|images]
#
# dev:  light (default) | deep | all
# prod: light (default) | images  — NUNCA borra volúmenes de datos

set -euo pipefail

STACK="${1:-}"
MODE="${2:-light}"

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
    echo "Uso: $0 dev|prod [light|deep|all|images]" >&2
    exit 2
    ;;
esac

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
PROJECT_DIR="frontend-tenant"
PROJECT_LABEL="label=com.docker.compose.project=gestionar"

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: $ENV_FILE no encontrado.${NC}" >&2
  exit 1
fi

if [[ "$STACK" == "dev" ]]; then
  case "$MODE" in
    light|"")
      echo -e "${YELLOW}==> Limpieza ligera: containers stopped, imagenes huerfanas, build cache...${NC}"
      echo "  [1/4] Deteniendo stack..."
      "${COMPOSE[@]}" down --remove-orphans 2>/dev/null || true
      echo "  [2/4] Quitando contenedores stopped del proyecto..."
      docker container prune -f --filter "$PROJECT_LABEL" 2>/dev/null || true
      echo "  [3/4] Quitando imagenes dangling..."
      docker image prune -f 2>/dev/null || true
      echo "  [4/4] Limpiando build cache..."
      docker builder prune -f --filter "until=24h" 2>/dev/null || true
      echo ""
      echo -e "${GREEN}==> Limpieza ligera completa.${NC}"
      echo "  Volumes conservados. Para borrarlos: make clean MODE=deep"
      ;;
    deep)
      echo -e "${RED}==> Limpieza profunda: volumes + artefactos de build.${NC}"
      echo -e "${RED}    Se perdera la base de datos local (postgres_data), ChromaDB y uploads.${NC}"
      echo ""
      read -r -p "Confirmar (escribe 'borrar'): " confirm
      if [[ "$confirm" != "borrar" ]]; then
        echo "Cancelado."
        exit 0
      fi
      echo "  [1/6] Deteniendo stack y borrando volumes..."
      "${COMPOSE[@]}" down -v --remove-orphans 2>/dev/null || true
      echo "  [2/6] Borrando volumes del proyecto..."
      for vol in gestionar_postgres_data gestionar_chroma_data gestionar_uploads_data; do
        docker volume rm "$vol" 2>/dev/null && echo "    - $vol" || true
      done
      echo "  [3/6] Borrando imagenes del proyecto..."
      docker images --filter "$PROJECT_LABEL" -q 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true
      echo "  [4/6] Limpiando build cache completo..."
      docker builder prune -a -f 2>/dev/null || true
      echo "  [5/6] Borrando APKs..."
      rm -rf "$PROJECT_DIR/android/app/build/outputs/apk/"* 2>/dev/null && echo "    - APKs borrados" || true
      echo "  [6/6] node_modules (volume) se recrea en el proximo 'make rebuild'."
      ;;
    all)
      echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
      echo -e "${RED}║  ATENCION: docker system prune -a -f                 ║${NC}"
      echo -e "${RED}║  Borra TODOS los contenedores stopped, imagenes no    ║${NC}"
      echo -e "${RED}║  usadas, redes y build cache DEL SISTEMA ENTERO.     ║${NC}"
      echo -e "${RED}║  Afecta otros proyectos Docker en esta maquina.      ║${NC}"
      echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
      echo ""
      read -r -p "Confirmar (escribe 'BORRAR TODO'): " confirm
      if [[ "$confirm" != "BORRAR TODO" ]]; then
        echo "Cancelado."
        exit 0
      fi
      echo "  [1/2] Deteniendo stack..."
      "${COMPOSE[@]}" down -v --remove-orphans 2>/dev/null || true
      echo "  [2/2] docker system prune -a -f..."
      docker system prune -a -f --volumes 2>/dev/null || true
      echo ""
      echo -e "${GREEN}==> Limpieza total completa.${NC}"
      ;;
    *)
      echo -e "${RED}ERROR: modo '$MODE' no valido para dev. Usar: light | deep | all${NC}" >&2
      exit 2
      ;;
  esac
else
  case "$MODE" in
    light|"")
      echo -e "${YELLOW}==> Limpieza ligera (PROD — seguro, no toca datos)...${NC}"
      echo "  [1/3] Quitando contenedores stopped del proyecto..."
      docker container prune -f --filter "$PROJECT_LABEL" 2>/dev/null || true
      echo "  [2/3] Quitando imagenes dangling..."
      docker image prune -f 2>/dev/null || true
      echo "  [3/3] Limpiando build cache (>48h)..."
      docker builder prune -f --filter "until=48h" 2>/dev/null || true
      echo ""
      echo -e "${GREEN}==> Limpieza ligera completa.${NC}"
      echo "  Volumes y servicios corriendo NO fueron afectados."
      ;;
    images)
      echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
      echo -e "${RED}║  ATENCION: limpieza de imagenes del proyecto.        ║${NC}"
      echo -e "${RED}║  Se hara DOWN del stack y se borraran TODAS las      ║${NC}"
      echo -e "${RED}║  imagenes Docker del proyecto gestion.ar.            ║${NC}"
      echo -e "${RED}║  Los volumes de datos (BD, chroma, uploads) NO se    ║${NC}"
      echo -e "${RED}║  borran, pero se requiere rebuild para volver a      ║${NC}"
      echo -e "${RED}║  levantar (downtime estimado: 3-5 min).              ║${NC}"
      echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
      echo ""
      read -r -p "Confirmar (escribe 'gestionar-prod-down'): " confirm
      if [[ "$confirm" != "gestionar-prod-down" ]]; then
        echo "Cancelado."
        exit 0
      fi
      echo "  [1/4] Deteniendo stack (sin borrar volumes)..."
      "${COMPOSE[@]}" down --remove-orphans 2>/dev/null || true
      echo "  [2/4] Borrando imagenes del proyecto..."
      docker images --filter "$PROJECT_LABEL" -q 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true
      echo "  [3/4] Limpiando build cache..."
      docker builder prune -a -f 2>/dev/null || true
      echo "  [4/4] Quitando contenedores huerfanos..."
      docker container prune -f 2>/dev/null || true
      echo ""
      echo -e "${GREEN}==> Limpieza de imagenes completa.${NC}"
      echo -e "${YELLOW}  Para volver a levantar: make prod-rebuild${NC}"
      echo "  Los volumes de datos NO fueron borrados."
      ;;
    *)
      echo -e "${RED}ERROR: modo '$MODE' no valido para prod. Usar: light | images${NC}" >&2
      exit 2
      ;;
  esac
fi

echo ""
echo -e "${CYAN}── Estado post-limpieza ──${NC}"
docker system df 2>/dev/null || true
