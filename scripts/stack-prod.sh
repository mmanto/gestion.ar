#!/bin/bash
# stack-prod.sh — Gestión del stack de producción de gestion.ar
#
# Wrapper alrededor de docker compose que carga .env.prod y los compose files
# correctos, aislando las variables del host. Sin parámetros, muestra un menú
# interactivo. Con parámetro, ejecuta la operación directo.
#
# Uso: ./stack.prod [comando] [servicio]
#
# Comandos:
#   up            levantar todo (docker compose up -d)
#   down          detener todo
#   restart       restart de un servicio o de todo
#   rebuild       down + build + up (reconstruye imagenes y levanta)
#   logs          ver logs de un servicio (requiere nombre de servicio)
#   ps            listar contenedores y su estado
#   shell         abrir shell en un servicio (requiere nombre de servicio)
#   clean         limpiar recursos (--images: tambien imagenes del proyecto)
#   build-android build APK debug de la app nativa de un tenant (slug emulator|device|prod)
#
# Ejemplos:
#   ./stack.prod                                  # menu interactivo
#   ./stack.prod up                               # levantar todo
#   ./stack.prod logs app                         # logs del backend
#   ./stack.prod restart frontend                 # restart del frontend
#   ./stack.prod clean                            # limpiar recursos (seguro, sin datos)
#   ./stack.prod build-android ius emulator       # APK de ius para emulador Android
#   ./stack.prod build-android erma prod https://api.intellify.pro/api  # APK de erma contra prod
#
# Requisitos:
#   .env.prod presente en la raíz del repo
#   docker compose disponible
#   docker network create traefik_public (una sola vez)

set -euo pipefail

ENV_FILE=".env.prod"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tenants.prod.yml)

CORE_SERVICES=(app frontend)
TENANTS=(ius erma)
# ius-landing comparte dominio con el tenant "ius" (routing por Path en
# Traefik, ver docker-compose.tenants.prod.yml) — mismo host que TENANTS,
# por eso no necesita entrada propia en health_check().
SITES=(ius-landing)
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

  # SITES no suma un check propio: ius-landing responde en el mismo host
  # que el tenant "ius" (arriba), Traefik lo distingue por Path.
}

menu() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}     ${GREEN}gestion.ar${NC} — stack de producción       ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}     core: app, frontend                     ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}     tenants: ${TENANTS[*]}                         ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}     sites: ${SITES[*]}                        ${CYAN}║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC} 1) up          levantar todo               ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 2) down        detener todo                ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 3) restart     restart de un servicio      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 4) rebuild     reconstruir y levantar      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 5) logs        ver logs                   ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 6) ps          listar contenedores         ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 7) status      estado + health checks      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 8) shell       abrir shell en servicio     ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} c) clean       limpiar recursos            ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} b) build-android build APK por tenant       ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} q) salir                                  ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
  echo ""
  read -r -p "Opcion: " choice

  case "$choice" in
    1) cmd_up ;;
    2) cmd_down ;;
    3) read -r -p "Servicio (app, frontend, ${TENANTS[*]} ${SITES[*]}): " svc; cmd_restart "$svc" ;;
    4) cmd_rebuild ;;
    5) read -r -p "Servicio (app, frontend, ${TENANTS[*]} ${SITES[*]}): " svc; cmd_logs "$svc" ;;
    6) cmd_ps ;;
    7) cmd_status ;;
    8) read -r -p "Servicio (app, frontend, ${TENANTS[*]} ${SITES[*]}): " svc; cmd_shell "$svc" ;;
    c|C) read -r -p "Modo (Enter=ligero, images): " mode; cmd_clean "${mode:-light}" ;;
    b|B) read -r -p "Tenant (ius|erma|laboralia|proptech): " tslug; read -r -p "Entorno (emulator|device|prod): " env; cmd_build_android "$tslug" "${env:-emulator}" ;;
    q|Q) exit 0 ;;
    *) echo -e "${RED}Opcion invalida${NC}"; menu ;;
  esac
}



# Resuelve un nombre corto de servicio al nombre de contenedor en compose.
# Ej: "ius" → "frontend-tenant-ius", "ius-landing" → "landing-ius", "app" → "app".
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
  for site in "${SITES[@]}"; do
    if [[ "$name" == "$site" ]]; then
      echo "landing-${name%-landing}"
      return 0
    fi
  done
  return 1
}

prompt_service() {
  local prompt="${1:-Servicio}"
  echo ""
  echo "Servicios: app | frontend | ${TENANTS[*]} ${SITES[*]}"
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
      echo -e "${RED}ERROR: servicio '$svc' no válido. Usar: app | frontend | ${TENANTS[*]} ${SITES[*]}${NC}"
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
    echo -e "${RED}ERROR: especificá un servicio: app | frontend | ${TENANTS[*]} ${SITES[*]}${NC}"
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
    echo -e "${RED}ERROR: especificá un servicio: app | frontend | ${TENANTS[*]} ${SITES[*]}${NC}"
    return 1
  fi
  local container
  container=$(resolve_service "$svc") || {
    echo -e "${RED}ERROR: servicio '$svc' no válido.${NC}"
    return 1
  }
  "${COMPOSE_CMD[@]}" exec "$container" sh
}

# ── Limpieza de recursos (PROD — conservador, NUNCA toca volumes) ─────────

cmd_clean() {
  local mode="${1:-light}"

  if [[ "$mode" == "--help" || "$mode" == "-h" ]]; then
    echo "Uso: $0 clean [--images]"
    echo "  (sin flag)   Limpieza ligera: containers stopped, imagenes dangling, build cache"
    echo "  --images     + baja el stack, borra TODAS las imagenes del proyecto y build cache"
    echo "               (Requiere confirmacion. NUNCA borra volumes de datos.)"
    return 0
  fi

  case "$mode" in
    light|"")
      echo -e "${YELLOW}==> Limpieza ligera (PROD — seguro, no toca datos)...${NC}"
      echo ""

      echo "  [1/3] Quitando contenedores stopped del proyecto..."
      docker container prune -f --filter "label=com.docker.compose.project=gestionar" 2>/dev/null || true

      echo "  [2/3] Quitando imagenes dangling..."
      docker image prune -f 2>/dev/null || true

      echo "  [3/3] Limpiando build cache (>48h)..."
      docker builder prune -f --filter "until=48h" 2>/dev/null || true

      echo ""
      echo -e "${GREEN}==> Limpieza ligera completa.${NC}"
      echo "  Volumes y servicios corriendo NO fueron afectados."
      ;;

    --images)
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
        return 0
      fi
      echo ""

      echo "  [1/4] Deteniendo stack (sin borrar volumes)..."
      "${COMPOSE_CMD[@]}" down --remove-orphans 2>/dev/null || true

      echo "  [2/4] Borrando imagenes del proyecto..."
      docker images --filter "label=com.docker.compose.project=gestionar" -q 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true

      echo "  [3/4] Limpiando build cache..."
      docker builder prune -a -f 2>/dev/null || true

      echo "  [4/4] Quitando contenedores huerfanos..."
      docker container prune -f 2>/dev/null || true

      echo ""
      echo -e "${GREEN}==> Limpieza de imagenes completa.${NC}"
      echo -e "${YELLOW}  Para volver a levantar: ./stack.prod rebuild${NC}"
      echo "  Los volumes de datos NO fueron borrados."
      ;;

    *)
      echo -e "${RED}ERROR: modo '${mode}' no valido. Usar: --images${NC}"
      return 1
      ;;
  esac

  echo ""
  echo -e "${CYAN}── Estado post-limpieza ──${NC}"
  docker system df 2>/dev/null || true
}


# ── Android build (host, no Docker) ────────────────────────────────────────
# App nativa por tenant (ver ADR-007 en docs/dev/DECISIONS.md). android/ esta
# trackeado en git como snapshot de ius: para compilar otro tenant se parchea
# transitoriamente (applicationId/strings/iconos), se compila, y se restaura
# con git checkout al terminar — asi ius sigue siendo la build de referencia
# siempre limpia en el repo. Un solo target de build — sin fork de
# VITE_TARGET/MobileShell (esa fue la causa del revert anterior) — el mismo
# `npm run build:capacitor` para cualquier tenant/entorno, cambia solo las
# env vars horneadas.

ANDROID_TENANT_SLUGS=(ius erma laboralia proptech)

android_tenant_var() {
  # android_tenant_var erma APPID -> valor de $TENANT_APPID_ERMA
  local slug_upper
  slug_upper="$(echo "$1" | tr '[:lower:]' '[:upper:]')"
  local varname="TENANT_${2}_${slug_upper}"
  echo "${!varname:-}"
}

# Parchea android/ (applicationId, strings, icono/splash, google-services.json)
# para el tenant indicado. Asume que `frontend-tenant/android` esta limpio
# (verificado por el llamador). restore_android_tenant lo revierte despues.
patch_android_tenant() {
  local slug="$1" app_id="$2" app_name="$3" brand_color="$4"
  local build_gradle="frontend-tenant/android/app/build.gradle"
  local strings_xml="frontend-tenant/android/app/src/main/res/values/strings.xml"

  sed -i "s/applicationId \"[^\"]*\"/applicationId \"${app_id}\"/" "$build_gradle"
  sed -i \
    -e "s|<string name=\"app_name\">[^<]*</string>|<string name=\"app_name\">${app_name}</string>|" \
    -e "s|<string name=\"title_activity_main\">[^<]*</string>|<string name=\"title_activity_main\">${app_name}</string>|" \
    -e "s|<string name=\"package_name\">[^<]*</string>|<string name=\"package_name\">${app_id}</string>|" \
    -e "s|<string name=\"custom_url_scheme\">[^<]*</string>|<string name=\"custom_url_scheme\">${app_id}</string>|" \
    -e "s|<string name=\"default_notification_channel_id\">[^<]*</string>|<string name=\"default_notification_channel_id\">${slug}_staff_messages</string>|" \
    "$strings_xml"

  local assets_dir="frontend-tenant/tenant-assets/${slug}"
  if [[ -f "$assets_dir/logo.png" ]]; then
    echo "  Regenerando icono/splash desde ${assets_dir}/logo.png ..."
    (cd frontend-tenant && npx capacitor-assets generate --android \
      --assetPath "tenant-assets/${slug}" \
      --iconBackgroundColor "#ffffff" \
      --splashBackgroundColor "${brand_color}") || {
      echo -e "${YELLOW}  WARNING: capacitor-assets fallo (revisa que 'sharp' este instalado — ver frontend-tenant/tenant-assets/${slug}/README.md), se usa el icono/splash ya committeado.${NC}" >&2
    }
  else
    echo -e "${YELLOW}  Sin ${assets_dir}/logo.png — se usa el icono/splash ya committeado (de ius).${NC}" >&2
  fi

  # google-services.json esta en frontend-tenant/android/.gitignore (nunca
  # trackeado) — si ya existe uno real en disco (ej. el de ius), 'git
  # checkout' NO puede restaurarlo si lo pisamos/borramos. Se hace un backup
  # aparte y se restaura explicitamente en restore_android_tenant.
  local gservices="frontend-tenant/android/app/google-services.json"
  GSERVICES_BACKUP=""
  if [[ -f "$gservices" ]]; then
    GSERVICES_BACKUP="$(mktemp)"
    cp "$gservices" "$GSERVICES_BACKUP"
  fi

  if [[ -f "$assets_dir/google-services.json" ]]; then
    cp "$assets_dir/google-services.json" "$gservices"
  elif [[ "$slug" != "ius" ]]; then
    rm -f "$gservices"
    echo -e "${YELLOW}  Sin ${assets_dir}/google-services.json — push notifications deshabilitadas para ${slug}.${NC}" >&2
  fi
}

restore_android_tenant() {
  git checkout -- frontend-tenant/android
  local gservices="frontend-tenant/android/app/google-services.json"
  if [[ -n "${GSERVICES_BACKUP:-}" ]]; then
    cp "$GSERVICES_BACKUP" "$gservices"
    rm -f "$GSERVICES_BACKUP"
  else
    rm -f "$gservices"
  fi
  GSERVICES_BACKUP=""
}

cmd_build_android() {
  local slug="${1:-}"
  local env="${2:-emulator}"
  local api_url="${3:-}"

  if [[ ! " ${ANDROID_TENANT_SLUGS[*]} " =~ " ${slug} " ]]; then
    echo -e "${RED}ERROR: tenant invalido '${slug}'. Usar: ${ANDROID_TENANT_SLUGS[*]}${NC}"
    return 1
  fi
  if [[ ! "$env" =~ ^(emulator|device|prod)$ ]]; then
    echo -e "${RED}ERROR: entorno invalido '${env}'. Usar: emulator | device | prod [api-url]${NC}"
    return 1
  fi

  local app_id app_name brand_color
  app_id="$(android_tenant_var "$slug" APPID)"
  app_name="$(android_tenant_var "$slug" APPNAME)"
  brand_color="$(android_tenant_var "$slug" BRANDCOLOR)"
  if [[ -z "$app_id" || -z "$app_name" || -z "$brand_color" ]]; then
    echo -e "${RED}ERROR: faltan TENANT_APPID_${slug^^} / TENANT_APPNAME_${slug^^} / TENANT_BRANDCOLOR_${slug^^} en ${ENV_FILE}.${NC}"
    return 1
  fi

  local tenant_id
  tenant_id="$(android_tenant_var "$slug" ID)"
  if [[ -z "$tenant_id" ]]; then
    echo -e "${RED}ERROR: falta TENANT_ID_${slug^^} en ${ENV_FILE}.${NC}"
    return 1
  fi

  # Nango self-hosted (Connect UI :3009 / API :3003) corre en la misma
  # maquina que el backend de dev, fuera del proxy /api — auth.service.ts
  # cae por default a http://localhost:3009|3003, que en un
  # emulador/dispositivo apunta al propio celular, no a la PC. En prod, en
  # cambio, Nango vive en su propio dominio (ver docker-compose.prod.yml),
  # no en el host del backend.
  local nango_connect_url nango_api_url
  case "$env" in
    emulator)
      api_url="${api_url:-http://10.0.2.2:8000/api}"
      nango_connect_url="http://10.0.2.2:3009"
      nango_api_url="http://10.0.2.2:3003"
      ;;
    device)
      if [[ -z "$api_url" ]]; then
        echo -e "${RED}ERROR: 'device' requiere la IP LAN del backend, ej: ./stack.prod build-android ${slug} device http://192.168.1.50:8000/api${NC}"
        return 1
      fi
      local nango_host
      nango_host="$(echo "$api_url" | sed -E 's#^https?://([^:/]+).*#\1#')"
      nango_connect_url="http://${nango_host}:3009"
      nango_api_url="http://${nango_host}:3003"
      ;;
    prod)
      if [[ -z "$api_url" ]]; then
        echo -e "${RED}ERROR: 'prod' requiere la URL real del backend, ej: ./stack.prod build-android ${slug} prod https://api.intellify.pro/api${NC}"
        return 1
      fi
      nango_connect_url="https://nango.intellify.pro"
      nango_api_url="https://api.nango.intellify.pro"
      ;;
  esac

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

  if [[ -n "$(git status --porcelain -- frontend-tenant/android)" ]]; then
    echo -e "${RED}ERROR: frontend-tenant/android tiene cambios sin commitear. Guardalos o descartalos antes de compilar (build-android lo parchea y lo restaura con 'git checkout').${NC}"
    return 1
  fi

  echo -e "${CYAN}── Build Android [${GREEN}${slug}${CYAN}] (${GREEN}${env}${CYAN}) — API: ${api_url} — tenant: ${tenant_id} ──${NC}"

  patch_android_tenant "$slug" "$app_id" "$app_name" "$brand_color"
  trap restore_android_tenant RETURN

  # STATS_TWO_COLS_MOBILE=true replica lo que docker-compose.tenants.*.yml ya
  # setea para ius en la web (ver docker-entrypoint.sh) — sin esto el build
  # nativo horneaba statsTwoColsMobile:false y el dashboard mostraba las
  # stat cards en 1 columna en el celular en vez de 2 (StatsCards.tsx).
  local stats_two_cols="false"
  [[ "$slug" == "ius" ]] && stats_two_cols="true"

  echo "  [1/3] VITE_API_URL=${api_url} VITE_NANGO_CONNECT_URL=${nango_connect_url} VITE_NANGO_API_URL=${nango_api_url} VITE_TENANT_ID=${tenant_id} VITE_TENANT_APPID=${app_id} npm run build:capacitor ..."
  (cd "$project_dir" && VITE_API_URL="$api_url" VITE_NANGO_CONNECT_URL="$nango_connect_url" VITE_NANGO_API_URL="$nango_api_url" \
    VITE_TENANT_ID="$tenant_id" VITE_STATS_TWO_COLS_MOBILE="$stats_two_cols" \
    VITE_TENANT_APPID="$app_id" VITE_TENANT_APPNAME="$app_name" VITE_TENANT_BRANDCOLOR="$brand_color" \
    npm run build:capacitor) || {
    echo -e "${RED}  ERROR: npm run build:capacitor fallo${NC}"
    return 1
  }

  echo "  [2/3] npx cap sync android ..."
  (cd "$project_dir" && VITE_API_URL="$api_url" VITE_TENANT_APPID="$app_id" VITE_TENANT_APPNAME="$app_name" VITE_TENANT_BRANDCOLOR="$brand_color" npx cap sync android) || {
    echo -e "${RED}  ERROR: cap sync fallo${NC}"
    return 1
  }

  echo "  [3/3] ./gradlew assembleDebug ..."
  (cd "$project_dir/android" && ./gradlew assembleDebug 2>&1 | grep -E 'BUILD|FAILED|ERROR') || {
    echo -e "${RED}  ERROR: gradle build fallo${NC}"
    return 1
  }

  local built_apk="$project_dir/android/app/build/outputs/apk/debug/app-debug.apk"
  local out_dir="$project_dir/dist-apk"
  local apk="${out_dir}/gestionar-${slug}-debug.apk"
  echo ""
  echo -e "${GREEN}==> Build Android completo.${NC}"
  echo "  Tenant: ${slug} (applicationId: ${app_id})"
  echo "  API URL horneada: ${api_url}"
  echo "  Tenant ID horneado: ${tenant_id}"
  if [[ -f "$built_apk" ]]; then
    mkdir -p "$out_dir"
    cp "$built_apk" "$apk"
    local size=$(du -h "$apk" | cut -f1)
    echo -e "  ${GREEN}APK generado:${NC} ${apk} (${size})"
  fi
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
  clean)         cmd_clean "${1:-light}" ;;
  build-android) cmd_build_android "${1:-}" "${2:-emulator}" "${3:-}" ;;
  -h|--help|help)
    echo "Uso: $0 [up|down|restart|rebuild|logs|ps|status|shell|clean|build-android] [servicio|target]"
    echo "Sin parametros muestra el menu interactivo."
    echo "Tenants: ${TENANTS[*]} (usa el nombre corto: ius, erma)"
    echo "Sites: ${SITES[*]} (landing estatica, sin backend detras)"
    echo "clean: sin flag | --images"
    echo "build-android: <${ANDROID_TENANT_SLUGS[*]}> emulator | device [api-url] | prod [api-url] (default emulador: http://10.0.2.2:8000/api)"
    ;;
  *)             echo -e "${RED}Comando desconocido: $CMD${NC}"; menu ;;
esac
