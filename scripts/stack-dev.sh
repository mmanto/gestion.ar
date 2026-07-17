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
#   build-android build APK debug de la app nativa del staff de ius (emulator|device [api-url])
#   status        mostrar estado + health checks
#   shell         abrir shell en un servicio (requiere nombre de servicio)
#   clean         limpiar recursos (--deep: volumes+artefactos, --all: system prune)
# Ejemplos:
#   ./stack.dev                         # menu interactivo
#   ./stack.dev up                      # levantar todo
#   ./stack.dev logs app                # logs del backend
#   ./stack.dev restart frontend        # restart del frontend
#   ./stack.dev build-android emulator                          # APK para emulador (10.0.2.2)
#   ./stack.dev build-android device http://192.168.1.100:8000/api  # dispositivo fisico
#   ./stack.dev clean                   # limpiar recursos
#   docker network create traefik_public (una sola vez)
#   /etc/hosts con: 127.0.0.1 erma.com.test ius.mx.test

set -euo pipefail

ENV_FILE=".env.dev"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.tenants.local.yml)

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
  echo -e "${CYAN}║${NC} 9) build-android build APK (ius staff)          ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} c) clean         limpiar recursos              ${CYAN}║${NC}"
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
    9) read -r -p "Entorno (emulator|device): " env; cmd_build_android "${env:-emulator}" ;;
    c|C) read -r -p "Modo (Enter=ligero, deep, all): " mode; cmd_clean "${mode:-light}" ;;
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
# App nativa dedicada al staff de ius (ver ADR-007 en docs/dev/DECISIONS.md y
# el plan en /home/mmanto/.claude/plans/). Un solo target de build — sin
# fork de VITE_TARGET/MobileShell (esa fue la causa del revert anterior) —
# el mismo `npm run build:capacitor` para cualquier entorno, cambia solo el
# VITE_API_URL y el VITE_TENANT_ID horneados. El stack de dev solo builds
# contra el tenant local de ius (para prod usar ./stack.prod build-android).

IUS_TENANT_ID_LOCAL="tenant_6a10b2076443"

cmd_build_android() {
  local env="${1:-emulator}"
  local api_url="${2:-}"

  if [[ ! "$env" =~ ^(emulator|device)$ ]]; then
    echo -e "${RED}ERROR: entorno invalido '${env}'. Usar: emulator | device [api-url]${NC}"
    return 1
  fi

  if [[ "$env" == "device" && -z "$api_url" ]]; then
    echo -e "${RED}ERROR: 'device' requiere la IP LAN del backend, ej: ./stack.dev build-android device http://192.168.1.50:8000/api${NC}"
    return 1
  fi
  api_url="${api_url:-http://10.0.2.2:8000/api}"

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

  local gradlew="$project_dir/android/gradlew"
  if [[ ! -f "$gradlew" ]]; then
    echo -e "${RED}ERROR: $gradlew no encontrado. Ejecuta 'npx cap add android' primero.${NC}"
    return 1
  fi
  chmod +x "$gradlew"

  echo -e "${CYAN}── Build Android (${GREEN}${env}${CYAN}) — API: ${api_url} — tenant: ${IUS_TENANT_ID_LOCAL} ──${NC}"

  echo "  [1/3] VITE_API_URL=${api_url} VITE_TENANT_ID=${IUS_TENANT_ID_LOCAL} npm run build:capacitor ..."
  (cd "$project_dir" && VITE_API_URL="$api_url" VITE_TENANT_ID="$IUS_TENANT_ID_LOCAL" npm run build:capacitor) || {
    echo -e "${RED}  ERROR: npm run build:capacitor fallo${NC}"
    return 1
  }

  echo "  [2/3] npx cap sync android ..."
  (cd "$project_dir" && VITE_API_URL="$api_url" npx cap sync android) || {
    echo -e "${RED}  ERROR: cap sync fallo${NC}"
    return 1
  }

  echo "  [3/3] ./gradlew assembleDebug ..."
  (cd "$project_dir/android" && ./gradlew assembleDebug 2>&1 | grep -E 'BUILD|FAILED|ERROR') || {
    echo -e "${RED}  ERROR: gradle build fallo${NC}"
    return 1
  }

  local apk="$project_dir/android/app/build/outputs/apk/debug/app-debug.apk"
  echo ""
  echo -e "${GREEN}==> Build Android completo.${NC}"
  echo "  API URL horneada: ${api_url}"
  if [[ -f "$apk" ]]; then
    local size=$(du -h "$apk" | cut -f1)
    echo -e "  ${GREEN}APK generado:${NC} ${apk} (${size})"
  fi
}


# ── Limpieza de recursos ─────────────────────────────────────────────────

cmd_clean() {
  local mode="${1:-light}"
  local project_dir="frontend-tenant"

  if [[ "$mode" == "--help" || "$mode" == "-h" ]]; then
    echo "Uso: $0 clean [--deep|--all]"
    echo "  (sin flag)   Docker project prune (containers, images, build cache)"
    echo "  --deep       + volumes (postgres_data, chroma_data, uploads_data) + APKs + node_modules"
    echo "  --all        + docker system prune -a -f (AFECTA OTROS PROYECTOS!)"
    return 0
  fi

  case "$mode" in
    light|"")
      echo -e "${YELLOW}==> Limpieza ligera: containers stopped, imagenes huerfanas, build cache...${NC}"
      echo ""

      # Detener el stack primero
      echo "  [1/4] Deteniendo stack..."
      "${COMPOSE_CMD[@]}" down --remove-orphans 2>/dev/null || true

      # Quitar contenedores stopped del proyecto
      echo "  [2/4] Quitando contenedores stopped del proyecto..."
      docker container prune -f --filter "label=com.docker.compose.project=gestionar" 2>/dev/null || true

      # Quitar imagenes huerfanas (dangling)
      echo "  [3/4] Quitando imagenes dangling..."
      docker image prune -f 2>/dev/null || true

      # Limpiar build cache de Docker
      echo "  [4/4] Limpiando build cache..."
      docker builder prune -f --filter "until=24h" 2>/dev/null || true

      echo ""
      echo -e "${GREEN}==> Limpieza ligera completa.${NC}"
      echo "  Volumes conservados. Para borrarlos: ./stack.dev clean --deep"
      ;;

    --deep)
      echo -e "${RED}==> Limpieza profunda: volumes + artefactos de build.${NC}"
      echo -e "${RED}    Se perdera la base de datos local (postgres_data), ChromaDB y uploads.${NC}"
      echo ""
      read -r -p "Confirmar (escribe 'borrar'): " confirm
      if [[ "$confirm" != "borrar" ]]; then
        echo "Cancelado."
        return 0
      fi
      echo ""

      # Detener y borrar todo (incluyendo volumes)
      echo "  [1/6] Deteniendo stack y borrando volumes..."
      "${COMPOSE_CMD[@]}" down -v --remove-orphans 2>/dev/null || true

      # Borrar volumes explicitamente por si quedaron huerfanos
      echo "  [2/6] Borrando volumes del proyecto..."
      for vol in gestionar_postgres_data gestionar_chroma_data gestionar_uploads_data; do
        docker volume rm "$vol" 2>/dev/null && echo "    - $vol" || true
      done

      # Imagenes del proyecto
      echo "  [3/6] Borrando imagenes del proyecto..."
      docker images --filter "label=com.docker.compose.project=gestionar" -q 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true

      # Build cache completo
      echo "  [4/6] Limpiando build cache completo..."
      docker builder prune -a -f 2>/dev/null || true

      # APKs generados
      echo "  [5/6] Borrando APKs..."
      rm -rf "$project_dir/android/app/build/outputs/apk/"* 2>/dev/null && echo "    - APKs borrados" || true

      # node_modules (solo los montados en volumen, no los del host)
      echo "  [6/6] Borrando node_modules (volume)..."
      echo "  Para volver a empezar: ./stack.dev rebuild"
      ;;

    --all)
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
        return 0
      fi
      echo ""

      # Detener este stack
      echo "  [1/2] Deteniendo stack..."
      "${COMPOSE_CMD[@]}" down -v --remove-orphans 2>/dev/null || true

      # System prune
      echo "  [2/2] docker system prune -a -f..."
      docker system prune -a -f --volumes 2>/dev/null || true

      echo ""
      echo -e "${GREEN}==> Limpieza total completa.${NC}"
      ;;

    *)
      echo -e "${RED}ERROR: modo '${mode}' no valido. Usar: --deep | --all${NC}"
      return 1
      ;;
  esac

  # Mostrar espacio liberado
  echo ""
  echo -e "${CYAN}── Estado post-limpieza ──${NC}"
  docker system df 2>/dev/null || true
}

# ── Entrypoint ────────────────────────────────────────────────────────────

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
  build-android) cmd_build_android "${1:-emulator}" "${2:-}" ;;
  clean)         cmd_clean "${1:-light}" ;;
  -h|--help|help)
    echo "Uso: $0 [up|down|restart|rebuild|logs|ps|status|shell|build-android|clean] [servicio|target]"
    echo "Sin parametros muestra el menu interactivo."
    echo "Core: ${CORE_SERVICES[*]}"
    echo "Tenants: ${TENANTS[*]} (usa el nombre corto: erma, ius)"
    echo "build-android: emulator | device [api-url] (default: emulator, http://10.0.2.2:8000/api)"
    echo "clean: sin flag | --deep | --all"
    ;;
  *)             echo -e "${RED}Comando desconocido: $CMD${NC}"; menu ;;
esac
