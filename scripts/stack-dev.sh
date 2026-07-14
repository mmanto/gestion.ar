#!/bin/bash
# stack-dev.sh — Gestion del stack de desarrollo de gestion.ar
#
# Wrapper alrededor de docker compose que carga .env.dev y aisla las variables
# del host (evita que DB_USER/DB_PASSWORD/DB_NAME de otros proyectos contaminen
# la URL de Postgres). Sin parametros, muestra un menu interactivo.
#
# Incluye tenants de ejemplo (erma, ius) via docker-compose.tenants.local.yml
# con dominios .test resueltos a 127.0.0.1 via /etc/hosts.
#
# Comandos:
#   up            levantar todo (docker compose up -d)
#   down          detener todo
#   restart       restart de un servicio o de todo
#   rebuild       down + build + up (reconstruye imagenes y levanta)
#   logs          ver logs de un servicio (requiere nombre de servicio)
#   ps            listar contenedores y su estado
#   status        mostrar estado + health checks
#   shell         abrir shell en un servicio (requiere nombre de servicio)
#   build-android build APK debug (staff|client|both) desde frontend-tenant
# Ejemplos:
#   ./stack.dev                         # menu interactivo
#   ./stack.dev up                      # levantar todo
#   ./stack.dev logs app                # logs del backend
#   ./stack.dev restart frontend        # restart del frontend
#   ./stack.dev logs ius                # logs del tenant ius
#   ./stack.dev shell erma              # shell en tenant erma
#
# Requisitos:
#   .env.dev presente en la raiz del repo
#   docker compose disponible
#   docker network create traefik_public (una sola vez)
#   /etc/hosts con: 127.0.0.1 erma.com.test ius.mx.test

set -euo pipefail

ENV_FILE=".env.dev"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.tenants.local.yml)

CORE_SERVICES=(app frontend postgres redis traefik-local)
TENANTS=(erma ius)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Validacion de entorno ────────────────────────────────────────────────

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}ERROR: $ENV_FILE no encontrado.${NC}"
  echo "Crealo desde .env.example con las credenciales de desarrollo."
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

COMPOSE_CMD=(docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}")

# ── /etc/hosts check ─────────────────────────────────────────────────────

check_hosts() {
  local missing=()
  local -A DOMAIN_MAP=(["erma"]="erma.com.test" ["ius"]="ius.mx.test")
  for tenant in "${TENANTS[@]}"; do
    local domain="${DOMAIN_MAP[$tenant]}"
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
}

# Ejecutar al inicio (solo warning, no bloquea)
check_hosts

# Asegurar red externa
if ! docker network inspect traefik_public &>/dev/null; then
  echo "Creando red traefik_public..."
  docker network create traefik_public
fi

# ── Funciones ─────────────────────────────────────────────────────────────

health_check() {
  echo -e "\n${CYAN}── Health checks ──${NC}"

  curl -sf -o /dev/null -w "app:       %{http_code}\n" http://localhost:8000/api/health \
    || echo -e "${RED}app:       sin respuesta${NC}"

  # Frontend — Vite dev server en 5173 (docker-compose.override.yml)
  if "${COMPOSE_CMD[@]}" ps frontend --format json 2>/dev/null | grep -q '"State":"running"'; then
    curl -sf -o /dev/null -w "frontend:  %{http_code}\n" http://localhost:5173/ \
      || echo -e "${YELLOW}frontend:  sin respuesta${NC}"
  else
    echo -e "${YELLOW}frontend:  no esta corriendo${NC}"
  fi

  # Tenants via Traefik en :80
  local -A DOMAIN_MAP=(["erma"]="erma.com.test" ["ius"]="ius.mx.test")
  for tenant in "${TENANTS[@]}"; do
    local domain="${DOMAIN_MAP[$tenant]}"
    curl -sf -o /dev/null -w "tenant-${tenant}: %{http_code}\n" "http://${domain}/" \
      || echo -e "${YELLOW}tenant-${tenant}: sin respuesta${NC}"
  done
}

menu() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}       ${GREEN}gestion.ar${NC} — stack de desarrollo         ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}       core: ${CORE_SERVICES[*]}  ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}       tenants: ${TENANTS[*]}                     ${CYAN}║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC} 1) up            levantar todo                 ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 2) down          detener todo                  ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 3) restart       restart de un servicio        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 4) rebuild       reconstruir y levantar        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 5) logs          ver logs                     ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 6) ps            listar contenedores           ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 7) status        estado + health checks        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 8) shell         abrir shell en servicio       ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 9) build-android build APK (staff/client)      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} q) salir                                      ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  read -r -p "Opcion: " choice

  case "$choice" in
    1) cmd_up ;;
    2) cmd_down ;;
    3) read -r -p "Servicio (${CORE_SERVICES[*]} ${TENANTS[*]}): " svc; cmd_restart "$svc" ;;
    4) cmd_rebuild ;;
    5) read -r -p "Servicio (${CORE_SERVICES[*]} ${TENANTS[*]}): " svc; cmd_logs "$svc" ;;
    6) cmd_ps ;;
    7) cmd_status ;;
    8) read -r -p "Servicio (${CORE_SERVICES[*]} ${TENANTS[*]}): " svc; cmd_shell "$svc" ;;
    9) read -r -p "Target (staff|client|both): " target; cmd_build_android "$target" ;;
    q|Q) exit 0 ;;
    *) echo -e "${RED}Opcion invalida${NC}"; menu ;;
  esac
}

# ── Helpers ───────────────────────────────────────────────────────────────

resolve_service() {
  local name="$1"
  # Core services: match exact compose service name
  for svc in "${CORE_SERVICES[@]}"; do
    if [[ "$name" == "$svc" ]]; then
      echo "$name"
      return 0
    fi
  done
  # Tenants: short name → compose service name (erma → frontend-tenant-erma)
  for tenant in "${TENANTS[@]}"; do
    if [[ "$name" == "$tenant" ]]; then
      echo "frontend-tenant-${tenant}"
      return 0
    fi
  done
  return 1
}

# ── Comandos ──────────────────────────────────────────────────────────────

cmd_up() {
  echo -e "${GREEN}==> Levantando stack de desarrollo...${NC}"
  "${COMPOSE_CMD[@]}" up -d
  echo -e "${GREEN}==> Esperando que los servicios esten healthy...${NC}"
  local timeout=120
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    local unhealthy
    unhealthy=$("${COMPOSE_CMD[@]}" ps --format json 2>/dev/null | grep -c '"Health":"unhealthy"' || true)
    if [ "$unhealthy" -eq 0 ]; then
      echo -e "${GREEN}==> Todos los servicios arriba.${NC}"
      echo -e "  Frontend: ${CYAN}http://localhost:5173${NC}"
      echo -e "  Backend:  ${CYAN}http://localhost:8000${NC}"
      for tenant in "${TENANTS[@]}"; do
        local domain="${tenant}.com.test"
        [[ "$tenant" == "ius" ]] && domain="ius.mx.test"
        echo -e "  Tenant ${tenant}: ${CYAN}http://${domain}${NC}"
      done
      cmd_ps
      return
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo -e "${YELLOW}==> Timeout esperando healthy — verifica con 'status'${NC}"
  cmd_ps
}

cmd_down() {
  echo -e "${YELLOW}==> Deteniendo stack de desarrollo...${NC}"
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
      echo -e "${RED}ERROR: servicio '$svc' no valido.${NC}"
      echo -e "Usar: ${CORE_SERVICES[*]} ${TENANTS[*]}"
      return 1
    }
    echo -e "${YELLOW}==> Restart de $container...${NC}"
    "${COMPOSE_CMD[@]}" restart "$container"
  fi
}

cmd_rebuild() {
  echo -e "${YELLOW}==> Reconstruyendo imagenes y levantando...${NC}"
  "${COMPOSE_CMD[@]}" up -d --build
  echo -e "${GREEN}==> Rebuild completo.${NC}"
  cmd_ps
}

cmd_logs() {
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    echo -e "${RED}ERROR: especifica un servicio.${NC}"
    echo -e "Usar: ${CORE_SERVICES[*]} ${TENANTS[*]}"
    return 1
  fi
  local container
  container=$(resolve_service "$svc") || {
    echo -e "${RED}ERROR: servicio '$svc' no valido.${NC}"
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
    echo -e "${RED}ERROR: especifica un servicio.${NC}"
    echo -e "Usar: ${CORE_SERVICES[*]} ${TENANTS[*]}"
    return 1
  fi
  local container
  container=$(resolve_service "$svc") || {
    echo -e "${RED}ERROR: servicio '$svc' no valido.${NC}"
    return 1
  }
  "${COMPOSE_CMD[@]}" exec "$container" sh
}

# ── Android build (host, no Docker) ────────────────────────────────────────

cmd_build_android() {
  local target="${1:-}"
  if [[ -z "$target" || ! "$target" =~ ^(staff|client|both)$ ]]; then
    echo -e "${RED}ERROR: target invalido '${target}'. Usar: staff | client | both${NC}"
    return 1
  fi

  # Validar requisitos
  local missing=()
  command -v node &>/dev/null || missing+=("node (npm)")
  command -v java &>/dev/null || missing+=("java (JDK 17+)")
  if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
    missing+=("ANDROID_HOME o ANDROID_SDK_ROOT")
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}Faltan requisitos:${NC}"
    for m in "${missing[@]}"; do echo "  - $m"; done
    echo ""
    echo "Instalar Android SDK: https://developer.android.com/studio#command-line-tools"
    return 1
  fi

  local project_dir="frontend-tenant"

  if [[ ! -f "$project_dir/package.json" ]]; then
    echo -e "${RED}ERROR: $project_dir no encontrado. Ejecuta desde la raiz del repo.${NC}"
    return 1
  fi

  # ./gradlew en el proyecto Capacitor
  local gradlew="$project_dir/android/gradlew"
  if [[ ! -f "$gradlew" ]]; then
    echo -e "${RED}ERROR: $gradlew no encontrado. Ejecuta 'npx cap add android' primero.${NC}"
    return 1
  fi
  chmod +x "$gradlew"

  build_one() {
    local t="$1"
    echo -e "${CYAN}── Build: ${GREEN}${t}${CYAN} ──${NC}"

    echo "  [1/3] npm run build:${t} ..."
    (cd "$project_dir" && npm run "build:${t}") || {
      echo -e "${RED}  ERROR: npm run build:${t} fallo${NC}"
      return 1
    }

    echo "  [2/3] npx cap sync (VITE_TARGET=${t}) ..."
    (cd "$project_dir" && VITE_TARGET="$t" npx cap sync) || {
      echo -e "${RED}  ERROR: cap sync fallo${NC}"
      return 1
    }

    echo "  [3/3] ./gradlew assembleDebug ..."
    (cd "$project_dir/android" && ./gradlew assembleDebug 2>&1 | grep -E 'BUILD|FAILED|ERROR') || {
      echo -e "${RED}  ERROR: gradle build fallo${NC}"
      return 1
    }

    local apk="$project_dir/android/app/build/outputs/apk/debug/app-debug.apk"
    if [[ -f "$apk" ]]; then
      local size=$(du -h "$apk" | cut -f1)
      echo -e "  ${GREEN}APK generado:${NC} ${apk} (${size})"
    fi
  }

  if [[ "$target" == "both" ]]; then
    build_one staff && build_one client
  else
    build_one "$target"
  fi

  echo ""
  echo -e "${GREEN}==> Build Android completo.${NC}"
  echo "  APKs en: $project_dir/android/app/build/outputs/apk/debug/"
  ls -lh "$project_dir/android/app/build/outputs/apk/debug/"*.apk 2>/dev/null || true
}

# ── Entrypoint ────────────────────────────────────────────────────────────


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
  build-android) cmd_build_android "${1:-staff}" ;;
  -h|--help|help)
    echo "Uso: $0 [up|down|restart|rebuild|logs|ps|status|shell|build-android] [servicio|target]"
    echo "Sin parametros muestra el menu interactivo."
    echo "Core: ${CORE_SERVICES[*]}"
    echo "Tenants: ${TENANTS[*]} (usa el nombre corto: erma, ius)"
    echo "build-android: staff | client | both (default: staff)"
    ;;
  *)             echo -e "${RED}Comando desconocido: $CMD${NC}"; menu ;;
esac
