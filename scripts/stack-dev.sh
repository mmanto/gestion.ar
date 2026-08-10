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
# Hot-reload de los tenants (Vite dev-server en vez del build de nginx, ver
# docker-compose.tenants.dev.yml): seteá TENANT_HOT_RELOAD=1 antes de
# up/rebuild/restart. Sin esa variable, up/rebuild/restart SIEMPRE dejan
# erma/ius en el build de produccion (nginx, sin hot-reload) — este wrapper
# no lo recuerda entre corridas, hay que pasarlo cada vez que se toca el
# stack (incluido un 'rebuild' de otro servicio).
#   TENANT_HOT_RELOAD=1 ./stack.dev rebuild ius
#
# Comandos:
#   up            levantar todo (docker compose up -d)
#   down          detener todo
#   restart       restart de un servicio o de todo
#   rebuild       down + build + up (reconstruye imagenes y levanta) — acepta servicio opcional
#   logs          ver logs de un servicio (requiere nombre de servicio)
#   build-android build APK debug de la app nativa de un tenant (slug emulator|device [api-url])
#   status        mostrar estado + health checks
#   shell         abrir shell en un servicio (requiere nombre de servicio)
#   clean         limpiar recursos (--deep: volumes+artefactos, --all: system prune)
# Ejemplos:
#   ./stack.dev                         # menu interactivo
#   ./stack.dev up                      # levantar todo
#   ./stack.dev logs app                # logs del backend
#   ./stack.dev restart frontend        # restart del frontend
#   ./stack.dev rebuild ius             # rebuild solo del tenant ius
#   TENANT_HOT_RELOAD=1 ./stack.dev rebuild ius  # idem, con hot-reload
#   ./stack.dev build-android ius emulator                          # APK de ius para emulador (10.0.2.2)
#   ./stack.dev build-android erma device http://192.168.1.100:8000/api  # APK de erma en dispositivo fisico
#   ./stack.dev clean                   # limpiar recursos
#   docker network create traefik_public (una sola vez)
#   /etc/hosts con: 127.0.0.1 erma.com.test ius.mx.test

set -euo pipefail

ENV_FILE=".env.dev"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.tenants.local.yml)
if [[ "${TENANT_HOT_RELOAD:-}" == "1" ]]; then
  COMPOSE_FILES+=(-f docker-compose.tenants.dev.yml)
fi

CORE_SERVICES=(app frontend postgres redis traefik-local)
TENANTS=(erma ius)
# ius-landing comparte dominio con el tenant "ius" (routing por Path en
# Traefik, ver docker-compose.tenants.local.yml) — mismo host que TENANTS,
# por eso no necesita entrada propia en check_hosts()/health_check().
SITES=(ius-landing)
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
  # SITES no necesita su propio chequeo: hoy ius-landing comparte dominio
  # con el tenant "ius", ya cubierto arriba.
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

  # SITES no suma un check propio: ius-landing responde en el mismo host
  # que el tenant "ius" (arriba), Traefik lo distingue por Path.
}

menu() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}       ${GREEN}gestion.ar${NC} — stack de desarrollo         ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}       core: ${CORE_SERVICES[*]}  ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}       tenants: ${TENANTS[*]}                     ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}       sites: ${SITES[*]}                    ${CYAN}║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC} 1) up            levantar todo                 ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 2) down          detener todo                  ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 3) restart       restart de un servicio        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 4) rebuild       reconstruir y levantar        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 5) logs          ver logs                     ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 6) ps            listar contenedores           ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 7) status        estado + health checks        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 8) shell         abrir shell en servicio       ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} 9) build-android build APK por tenant           ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} c) clean         limpiar recursos              ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC} q) salir                                      ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  read -r -p "Opcion: " choice

  case "$choice" in
    1) cmd_up ;;
    2) cmd_down ;;
    3) read -r -p "Servicio (${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}): " svc; cmd_restart "$svc" ;;
    4) read -r -p "Servicio (Enter=todo, ${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}): " svc; cmd_rebuild "$svc" ;;
    5) read -r -p "Servicio (${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}): " svc; cmd_logs "$svc" ;;
    6) cmd_ps ;;
    7) cmd_status ;;
    8) read -r -p "Servicio (${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}): " svc; cmd_shell "$svc" ;;
    9) read -r -p "Tenant (ius|erma): " tslug; read -r -p "Entorno (emulator|device): " env; cmd_build_android "$tslug" "${env:-emulator}" ;;
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
  # Sites: short name → compose service name (ius-landing → landing-ius)
  for site in "${SITES[@]}"; do
    if [[ "$name" == "$site" ]]; then
      echo "landing-${name%-landing}"
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
      echo -e "Usar: ${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}"
      return 1
    }
    echo -e "${YELLOW}==> Restart de $container...${NC}"
    "${COMPOSE_CMD[@]}" restart "$container"
  fi
}

cmd_rebuild() {
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    echo -e "${YELLOW}==> Reconstruyendo imagenes y levantando todo el stack...${NC}"
    "${COMPOSE_CMD[@]}" up -d --build
  else
    local container
    container=$(resolve_service "$svc") || {
      echo -e "${RED}ERROR: servicio '$svc' no valido.${NC}"
      echo -e "Usar: ${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}"
      return 1
    }
    echo -e "${YELLOW}==> Reconstruyendo $container...${NC}"
    "${COMPOSE_CMD[@]}" up -d --build "$container"
  fi
  echo -e "${GREEN}==> Rebuild completo.${NC}"
  cmd_ps
}

cmd_logs() {
  local svc="${1:-}"
  if [[ -z "$svc" ]]; then
    echo -e "${RED}ERROR: especifica un servicio.${NC}"
    echo -e "Usar: ${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}"
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
    echo -e "Usar: ${CORE_SERVICES[*]} ${TENANTS[*]} ${SITES[*]}"
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
# App nativa por tenant (ver ADR-007 en docs/dev/DECISIONS.md). android/ esta
# trackeado en git como snapshot de ius: para compilar otro tenant se parchea
# transitoriamente (applicationId/strings/iconos), se compila, y se restaura
# con git checkout al terminar — asi ius sigue siendo la build de referencia
# siempre limpia en el repo. Un solo target de build — sin fork de
# VITE_TARGET/MobileShell (esa fue la causa del revert anterior) — el mismo
# `npm run build:capacitor` para cualquier tenant/entorno, cambia solo las
# env vars horneadas. El stack de dev solo builds contra tenants locales
# (erma, ius — para prod usar ./stack.prod build-android).

ANDROID_TENANT_SLUGS=(ius erma)

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
  if [[ ! "$env" =~ ^(emulator|device)$ ]]; then
    echo -e "${RED}ERROR: entorno invalido '${env}'. Usar: emulator | device [api-url]${NC}"
    return 1
  fi

  local app_id app_name brand_color tenant_id
  app_id="$(android_tenant_var "$slug" APPID)"
  app_name="$(android_tenant_var "$slug" APPNAME)"
  brand_color="$(android_tenant_var "$slug" BRANDCOLOR)"
  tenant_id="$(android_tenant_var "$slug" ID)"
  if [[ -z "$app_id" || -z "$app_name" || -z "$brand_color" ]]; then
    echo -e "${RED}ERROR: faltan TENANT_APPID_${slug^^} / TENANT_APPNAME_${slug^^} / TENANT_BRANDCOLOR_${slug^^} en ${ENV_FILE}.${NC}"
    return 1
  fi
  if [[ -z "$tenant_id" ]]; then
    echo -e "${RED}ERROR: falta TENANT_ID_${slug^^} en ${ENV_FILE}.${NC}"
    return 1
  fi

  if [[ "$env" == "device" && -z "$api_url" ]]; then
    echo -e "${RED}ERROR: 'device' requiere la IP LAN del backend, ej: ./stack.dev build-android ${slug} device http://192.168.1.50:8000/api${NC}"
    return 1
  fi
  api_url="${api_url:-http://10.0.2.2:8000/api}"

  # Nango self-hosted (Connect UI :3009 / API :3003) corre en la misma
  # maquina de dev que el backend, fuera del proxy /api — mismo problema que
  # api_url: auth.service.ts cae por default a http://localhost:3009|3003,
  # que en un emulador/dispositivo apunta al propio celular, no a la PC.
  # Se reusa el host resuelto de api_url (10.0.2.2 en emulador, la IP LAN en
  # device) y se le pisan los puertos de Nango.
  local nango_host
  nango_host="$(echo "$api_url" | sed -E 's#^https?://([^:/]+).*#\1#')"
  local nango_connect_url="http://${nango_host}:3009"
  local nango_api_url="http://${nango_host}:3003"

  # Remote de appointments (Module Federation, ADR-009): el dev-server de
  # frontend-widgets corre en la misma maquina que el backend (puerto 8180,
  # ver .env.dev / docker-compose.tenants.dev.yml). Su URL en .env.dev es
  # localhost:8180 — inalcanzable desde emulador/dispositivo, igual que
  # ocurria con api_url. Reutilizamos el host resuelto de api_url
  # (10.0.2.2 en emulador, IP LAN en device) para apuntar al dev-server.
  # Se puede sobreescribir con VITE_APPOINTMENTS_REMOTE_URL (p.ej. un tunel).
  local appointments_remote="${VITE_APPOINTMENTS_REMOTE_URL:-}"
  if [[ -z "$appointments_remote" ]]; then
    appointments_remote="http://${nango_host}:8180/remoteEntry.js"
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

  echo "  [1/3] VITE_API_URL=${api_url} VITE_APPOINTMENTS_REMOTE_URL=${appointments_remote} VITE_NANGO_CONNECT_URL=${nango_connect_url} VITE_NANGO_API_URL=${nango_api_url} VITE_TENANT_ID=${tenant_id} VITE_TENANT_APPID=${app_id} npm run build:capacitor ..."
  (cd "$project_dir" && VITE_API_URL="$api_url" VITE_APPOINTMENTS_REMOTE_URL="$appointments_remote" VITE_NANGO_CONNECT_URL="$nango_connect_url" VITE_NANGO_API_URL="$nango_api_url" \
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
  if [[ -f "$built_apk" ]]; then
    mkdir -p "$out_dir"
    cp "$built_apk" "$apk"
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
  rebuild)       cmd_rebuild "${1:-}" ;;
  logs)          cmd_logs "${1:-}" ;;
  ps)            cmd_ps ;;
  status)        cmd_status ;;
  shell)         cmd_shell "${1:-}" ;;
  build-android) cmd_build_android "${1:-}" "${2:-emulator}" "${3:-}" ;;
  clean)         cmd_clean "${1:-light}" ;;
  -h|--help|help)
    echo "Uso: $0 [up|down|restart|rebuild|logs|ps|status|shell|build-android|clean] [servicio|target]"
    echo "Sin parametros muestra el menu interactivo."
    echo "Core: ${CORE_SERVICES[*]}"
    echo "Tenants: ${TENANTS[*]} (usa el nombre corto: erma, ius)"
    echo "Sites: ${SITES[*]} (landing estatica, sin backend detras)"
    echo "build-android: <${ANDROID_TENANT_SLUGS[*]}> emulator | device [api-url] (default: emulator, http://10.0.2.2:8000/api)"
    echo "clean: sin flag | --deep | --all"
    echo "TENANT_HOT_RELOAD=1 antes del comando: erma/ius quedan con Vite dev-server (hot-reload) en vez del build de nginx"
    ;;
  *)             echo -e "${RED}Comando desconocido: $CMD${NC}"; menu ;;
esac
