#!/bin/bash
# stack-prod.sh — Gestión del stack de producción de gestion.ar
#
# Wrapper alrededor de docker compose que carga .env.prod y los compose files
# correctos, aislando las variables del host. Sin parámetros, muestra un menú
# interactivo. Con parámetro, ejecuta la operación directo.
#
# Uso: ./scripts/stack-prod.sh [comando] [servicio]
#
# Comandos:
#   up            levantar todo (equivalente a docker compose up -d)
#   down          detener todo
#   restart       restart de un servicio o de todo
#   rebuild       down + build + up (reconstruye imágenes y levanta)
#   logs          ver logs de un servicio (requiere nombre de servicio)
#   ps            listar contenedores y su estado
#   status        mostrar estado + health checks
#   shell         abrir shell en un servicio (requiere nombre de servicio)
#
# Ejemplos:
#   ./scripts/stack-prod.sh              # menú interactivo
#   ./scripts/stack-prod.sh up           # levantar todo
#   ./scripts/stack-prod.sh logs app     # logs del backend
#   ./scripts/stack-prod.sh restart frontend
#   ./scripts/stack-prod.sh shell app
#
# Requisitos:
#   .env.prod presente en la raíz del repo
#   docker compose disponible
#   docker network create traefik_public (una sola vez)

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.prod"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tenants.prod.yml)

CORE_SERVICES=(app frontend)
TENANTS=(ius erma)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Validación de entorno ─────────────────────────────────────────────────────

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: $ENV_FILE no encontrado.${NC}"
  echo "Crealo desde .env.example con las credenciales de producción."
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

COMPOSE_CMD=(docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}")

# Asegurar red externa
if ! docker network inspect traefik_public &>/dev/null; then
  echo "Creando red traefik_public..."
  docker network create traefik_public
fi

# ── Funciones ─────────────────────────────────────────────────────────────────

health_check() {
  echo -e "\n${CYAN}── Health checks ──${NC}"
  local api_url="${WEBHOOK_BASE_URL:-https://api.intellify.pro}"
  local frontend_url="${FRONTEND_URL:-https://admin.intellify.pro}"

  curl -sf -o /dev/null -w "api:       %{http_code}\n" "$api_url/api/health" \
    || echo -e "${RED}api:       sin respuesta${NC}"

  curl -sf -o /dev/null -w "frontend:  %{http_code}\n" "$frontend_url/" \
    || echo -e "${RED}frontend:  sin respuesta${NC}"

  for tenant in "${TENANTS[@]}"; do
    local tenant_url="https://${tenant}.intellify.pro"
    curl -sf -o /dev/null -w "$tenant: %{http_code}\n" "$tenant_url/" \
      || echo -e "${YELLOW}$tenant: sin respuesta${NC}"
  done
}

menu() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}     ${GREEN}gestion.ar${NC} — stack de producción       ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}     core: app, frontend                     ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}     tenants: ${TENANTS[*]}                         ${CYAN}║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC} 1) up          levantar todo               ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 2) down        detener todo                ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 3) restart     restart de un servicio      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 4) rebuild     reconstruir y levantar      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 5) logs        ver logs                   ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 6) ps          listar contenedores         ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 7) status      estado + health checks      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 8) shell       abrir shell en servicio     ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} q) salir                                  ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
  echo ""
  read -r -p "Opción: " choice

  case "$choice" in
    1) cmd_up ;;
    2) cmd_down ;;
    3) read -r -p "Servicio (app, frontend, ${TENANTS[*]}): " svc; cmd_restart "$svc" ;;
    4) cmd_rebuild ;;
    5) read -r -p "Servicio (app, frontend, ${TENANTS[*]}): " svc; cmd_logs "$svc" ;;
    6) cmd_ps ;;
    7) cmd_status ;;
    8) read -r -p "Servicio (app, frontend, ${TENANTS[*]}): " svc; cmd_shell "$svc" ;;
    q|Q) exit 0 ;;
    *) echo -e "${RED}Opción inválida${NC}"; menu ;;
  esac
}


# Resuelve un nombre corto de servicio al nombre de contenedor en compose.
# Ej: "ius" → "frontend-tenant-ius", "app" → "app".
# Retorna 1 si el servicio no es válido.
resolve_service() {
  local name="$1"
  for core in "${CORE_SERVICES[@]}"; do
    if [[ "$name" == "$core" ]]; then
      echo "$name"
      return 0
    fi
  done
  for tenant in "${TENANTS[@]}"; do
    if [[ "$name" == "$tenant" ]]; then
      echo "frontend-tenant-$name"
      return 0
    fi
  done
  return 1
}

prompt_service() {
  local prompt="${1:-Servicio}"
  echo ""
  echo "Servicios: app | frontend | ${TENANTS[*]}"
  read -r -p "$prompt: " svc
  echo "$svc"
}

# ── Comandos ──────────────────────────────────────────────────────────────────

cmd_up() {
  echo -e "${GREEN}==> Levantando stack de producción...${NC}"
  "${COMPOSE_CMD[@]}" up -d
  echo -e "${GREEN}==> Esperando que los servicios estén healthy...${NC}"
  local timeout=120
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    local unhealthy
    unhealthy=$("${COMPOSE_CMD[@]}" ps --format json 2>/dev/null | grep -c '"Health"' || true)
    if [ "$unhealthy" -eq 0 ]; then
      echo -e "${GREEN}==> Todos los servicios arriba.${NC}"
      cmd_ps
      return
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo -e "${YELLOW}==> Timeout esperando healthy — verificá con 'status'${NC}"
  cmd_ps
}

cmd_down() {
  echo -e "${YELLOW}==> Deteniendo stack de producción...${NC}"
  "${COMPOSE_CMD[@]}" down
  echo -e "${GREEN}==> Stack detenido.${NC}"
}

cmd_restart() {
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    echo -e "${YELLOW}==> Restart de todos los servicios...${NC}"
    "${COMPOSE_CMD[@]}" restart
  else
    local container
    container=$(resolve_service "$svc") || {
      echo -e "${RED}ERROR: servicio '$svc' no válido. Usar: app | frontend | ${TENANTS[*]}${NC}"
      return 1
    }
    echo -e "${YELLOW}==> Restart de $container...${NC}"
    "${COMPOSE_CMD[@]}" restart "$container"
  fi
}

cmd_rebuild() {
  echo -e "${YELLOW}==> Reconstruyendo imágenes y levantando...${NC}"
  "${COMPOSE_CMD[@]}" up -d --build
  echo -e "${GREEN}==> Rebuild completo.${NC}"
  cmd_ps
}

cmd_logs() {
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    echo -e "${RED}ERROR: especificá un servicio: app | frontend | ${TENANTS[*]}${NC}"
    return 1
  fi
  local container
  container=$(resolve_service "$svc") || {
    echo -e "${RED}ERROR: servicio '$svc' no válido.${NC}"
    return 1
  }
  "${COMPOSE_CMD[@]}" logs -f --tail=100 "$container"
}

cmd_ps() {
  echo -e "\n${CYAN}── Contenedores ──${NC}"
  "${COMPOSE_CMD[@]}" ps
}

cmd_status() {
  cmd_ps
  health_check
}

cmd_shell() {
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    echo -e "${RED}ERROR: especificá un servicio: app | frontend | ${TENANTS[*]}${NC}"
    return 1
  fi
  local container
  container=$(resolve_service "$svc") || {
    echo -e "${RED}ERROR: servicio '$svc' no válido.${NC}"
    return 1
  }
  "${COMPOSE_CMD[@]}" exec "$container" sh
}

# ── Entrypoint ────────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  menu
  exit 0
fi

CMD="$1"
shift || true

case "$CMD" in
  up)            cmd_up ;;
  down)          cmd_down ;;
  restart)       cmd_restart "${1:-}" ;;
  rebuild)       cmd_rebuild ;;
  logs)          cmd_logs "${1:-}" ;;
  ps)            cmd_ps ;;
  status)        cmd_status ;;
  shell)         cmd_shell "${1:-}" ;;
  -h|--help|help)
    echo "Uso: $0 [up|down|restart|rebuild|logs|ps|status|shell] [servicio]"
    echo "Sin parámetros muestra el menú interactivo."
    ;;
  *)             echo -e "${RED}Comando desconocido: $CMD${NC}"; menu ;;
esac
