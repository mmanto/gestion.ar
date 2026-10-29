#!/bin/bash
# android-build.sh — build del APK debug de un tenant (host, no Docker).
#
# Uso: scripts/android-build.sh dev|prod <slug> <emulator|device|prod> [api-url]
#
# dev:  .env.dev  · targets emulator | device
# prod: .env.prod · targets emulator | device | prod
#
# `frontend-tenant/android/` está trackeado como snapshot de ius: antes de
# compilar se parchea (applicationId, strings, iconos, google-services.json) y
# al terminar se restaura con `git checkout`. Por eso exige el árbol limpio.
# Un solo target de build para todos los tenants: cambian solo las env vars
# horneadas (`npm run build:capacitor`).

set -euo pipefail

STACK="${1:-}"
SLUG="${2:-}"
TARGET="${3:-emulator}"
API_URL="${4:-}"

case "$STACK" in
  dev)  ENV_FILE=".env.dev" ;;
  prod) ENV_FILE=".env.prod" ;;
  *)
    echo "Uso: $0 dev|prod <slug> <emulator|device|prod> [api-url]" >&2
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

if [[ -z "$SLUG" ]]; then
  echo -e "${RED}ERROR: falta el tenant. Ej: make build-android TENANT=ius TARGET=emulator${NC}" >&2
  exit 1
fi
SLUG="${SLUG,,}"

if [[ "$STACK" == "dev" ]]; then
  if [[ ! "$TARGET" =~ ^(emulator|device)$ ]]; then
    echo -e "${RED}ERROR: target invalido '$TARGET' para dev. Usar: emulator | device${NC}" >&2
    exit 1
  fi
else
  if [[ ! "$TARGET" =~ ^(emulator|device|prod)$ ]]; then
    echo -e "${RED}ERROR: target invalido '$TARGET' para prod. Usar: emulator | device | prod${NC}" >&2
    exit 1
  fi
fi

android_tenant_var() {
  # android_tenant_var erma APPID -> valor de $TENANT_APPID_ERMA
  local slug_upper
  slug_upper="$(echo "$1" | tr '[:lower:]' '[:upper:]')"
  local varname="TENANT_${2}_${slug_upper}"
  echo "${!varname:-}"
}

APP_ID="$(android_tenant_var "$SLUG" APPID)"
APP_NAME="$(android_tenant_var "$SLUG" APPNAME)"
BRAND_COLOR="$(android_tenant_var "$SLUG" BRANDCOLOR)"
PUBLIC_URL="$(android_tenant_var "$SLUG" PUBLIC_URL)"
TENANT_ID="$(android_tenant_var "$SLUG" ID)"

if [[ -z "$APP_ID" || -z "$APP_NAME" || -z "$BRAND_COLOR" ]]; then
  echo -e "${RED}ERROR: faltan TENANT_APPID_${SLUG^^} / TENANT_APPNAME_${SLUG^^} / TENANT_BRANDCOLOR_${SLUG^^} en ${ENV_FILE}.${NC}" >&2
  exit 1
fi
if [[ -z "$TENANT_ID" ]]; then
  echo -e "${RED}ERROR: falta TENANT_ID_${SLUG^^} en ${ENV_FILE}.${NC}" >&2
  exit 1
fi

# Nango self-hosted (:3009/:3003) corre en la máquina de dev, fuera del proxy
# /api. En emulador/dispositivo se reutiliza el host alcanzable del backend.
case "$TARGET" in
  emulator)
    API_URL="${API_URL:-http://10.0.2.2:8000/api}"
    NANGO_CONNECT_URL="http://10.0.2.2:3009"
    NANGO_API_URL="http://10.0.2.2:3003"
    APPOINTMENTS_REMOTE_DEFAULT="http://10.0.2.2:8180/remoteEntry.js"
    ;;
  device)
    if [[ -z "$API_URL" ]]; then
      echo -e "${RED}ERROR: 'device' requiere la IP LAN del backend, ej: make build-android TENANT=${SLUG} TARGET=device API_URL=http://192.168.1.50:8000/api${NC}" >&2
      exit 1
    fi
    NANGO_HOST="$(echo "$API_URL" | sed -E 's#^https?://([^:/]+).*#\1#')"
    NANGO_CONNECT_URL="http://${NANGO_HOST}:3009"
    NANGO_API_URL="http://${NANGO_HOST}:3003"
    APPOINTMENTS_REMOTE_DEFAULT="http://${NANGO_HOST}:8180/remoteEntry.js"
    ;;
  prod)
    if [[ -z "$API_URL" ]]; then
      echo -e "${RED}ERROR: 'prod' requiere la URL real del backend, ej: make prod-build-android TENANT=${SLUG} TARGET=prod API_URL=https://api.intellify.pro/api${NC}" >&2
      exit 1
    fi
    NANGO_CONNECT_URL="https://nango.intellify.pro"
    NANGO_API_URL="https://api.nango.intellify.pro"
    APPOINTMENTS_REMOTE_DEFAULT="https://appointments-widgets.intellify.pro/remoteEntry.js"
    ;;
esac

APPOINTMENTS_REMOTE="${VITE_APPOINTMENTS_REMOTE_URL:-$APPOINTMENTS_REMOTE_DEFAULT}"

missing=()
command -v node &>/dev/null || missing+=("node (npm)")
command -v java &>/dev/null || missing+=("java (JDK 17+)")
if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  missing+=("ANDROID_HOME o ANDROID_SDK_ROOT")
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo -e "${RED}Faltan requisitos:${NC}" >&2
  for m in "${missing[@]}"; do echo "  - $m" >&2; done
  echo "Instalar Android SDK: https://developer.android.com/studio#command-line-tools" >&2
  exit 1
fi

PROJECT_DIR="frontend-tenant"
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  echo -e "${RED}ERROR: $PROJECT_DIR no encontrado. Ejecutá desde la raíz del repo.${NC}" >&2
  exit 1
fi

GRADLEW="$PROJECT_DIR/android/gradlew"
if [[ ! -f "$GRADLEW" ]]; then
  echo -e "${RED}ERROR: $GRADLEW no encontrado. Ejecutá 'npx cap add android' primero.${NC}" >&2
  exit 1
fi
chmod +x "$GRADLEW"

if [[ -n "$(git status --porcelain -- "$PROJECT_DIR/android")" ]]; then
  echo -e "${RED}ERROR: $PROJECT_DIR/android tiene cambios sin commitear. Guardalos o descartalos antes de compilar (build-android lo parchea y lo restaura con 'git checkout').${NC}" >&2
  exit 1
fi

GSERVICES_BACKUP=""

restore_android_tenant() {
  git checkout -- "$PROJECT_DIR/android" 2>/dev/null || true
  local gservices="$PROJECT_DIR/android/app/google-services.json"
  if [[ -n "${GSERVICES_BACKUP:-}" ]]; then
    cp "$GSERVICES_BACKUP" "$gservices"
    rm -f "$GSERVICES_BACKUP"
  else
    rm -f "$gservices"
  fi
  GSERVICES_BACKUP=""
}

patch_android_tenant() {
  local build_gradle="$PROJECT_DIR/android/app/build.gradle"
  local strings_xml="$PROJECT_DIR/android/app/src/main/res/values/strings.xml"

  sed -i "s/applicationId \"[^\"]*\"/applicationId \"${APP_ID}\"/" "$build_gradle"
  sed -i \
    -e "s|<string name=\"app_name\">[^<]*</string>|<string name=\"app_name\">${APP_NAME}</string>|" \
    -e "s|<string name=\"title_activity_main\">[^<]*</string>|<string name=\"title_activity_main\">${APP_NAME}</string>|" \
    -e "s|<string name=\"package_name\">[^<]*</string>|<string name=\"package_name\">${APP_ID}</string>|" \
    -e "s|<string name=\"custom_url_scheme\">[^<]*</string>|<string name=\"custom_url_scheme\">${APP_ID}</string>|" \
    -e "s|<string name=\"default_notification_channel_id\">[^<]*</string>|<string name=\"default_notification_channel_id\">${SLUG}_staff_messages</string>|" \
    "$strings_xml"

  local assets_dir="$PROJECT_DIR/tenant-assets/${SLUG}"
  if [[ -f "$assets_dir/logo.png" ]]; then
    echo "  Regenerando icono/splash desde ${assets_dir}/logo.png ..."
    (cd "$PROJECT_DIR" && npx capacitor-assets generate --android \
      --assetPath "tenant-assets/${SLUG}" \
      --iconBackgroundColor "#ffffff" \
      --splashBackgroundColor "${BRAND_COLOR}") || {
      echo -e "${YELLOW}  WARNING: capacitor-assets falló (revisá que 'sharp' esté instalado — ver ${assets_dir}/README.md), se usa el icono/splash ya committeado.${NC}" >&2
    }
  else
    echo -e "${YELLOW}  Sin ${assets_dir}/logo.png — se usa el icono/splash ya committeado (de ius).${NC}" >&2
  fi

  # google-services.json está en android/.gitignore (nunca trackeado): `git
  # checkout` no puede restaurarlo si lo pisamos, así que se respalda aparte.
  local gservices="$PROJECT_DIR/android/app/google-services.json"
  if [[ -f "$gservices" ]]; then
    GSERVICES_BACKUP="$(mktemp)"
    cp "$gservices" "$GSERVICES_BACKUP"
  fi

  if [[ -f "$assets_dir/google-services.json" ]]; then
    cp "$assets_dir/google-services.json" "$gservices"
  elif [[ "$SLUG" != "ius" ]]; then
    rm -f "$gservices"
    echo -e "${YELLOW}  Sin ${assets_dir}/google-services.json — push notifications deshabilitadas para ${SLUG}.${NC}" >&2
  fi
}

trap restore_android_tenant EXIT

echo -e "${CYAN}── Build Android [${GREEN}${SLUG}${CYAN}] (${GREEN}${TARGET}${CYAN}) — API: ${API_URL} — tenant: ${TENANT_ID} ──${NC}"

patch_android_tenant

# statsTwoColsMobile se resuelve desde tenants.settings (DB, vía
# /api/public/tenants/current); el valor horneado es un fallback legacy.
STATS_TWO_COLS="false"
[[ "$SLUG" == "ius" ]] && STATS_TWO_COLS="true"

echo "  [1/3] VITE_API_URL=${API_URL} VITE_APPOINTMENTS_REMOTE_URL=${APPOINTMENTS_REMOTE} VITE_NANGO_CONNECT_URL=${NANGO_CONNECT_URL} VITE_NANGO_API_URL=${NANGO_API_URL} VITE_TENANT_ID=${TENANT_ID} npm run build:capacitor ..."
(cd "$PROJECT_DIR" && VITE_API_URL="$API_URL" VITE_APPOINTMENTS_REMOTE_URL="$APPOINTMENTS_REMOTE" \
  VITE_NANGO_CONNECT_URL="$NANGO_CONNECT_URL" VITE_NANGO_API_URL="$NANGO_API_URL" \
  VITE_TENANT_ID="$TENANT_ID" VITE_STATS_TWO_COLS_MOBILE="$STATS_TWO_COLS" \
  VITE_TENANT_APPID="$APP_ID" VITE_TENANT_APPNAME="$APP_NAME" VITE_TENANT_BRANDCOLOR="$BRAND_COLOR" \
  VITE_TENANT_PUBLIC_URL="$PUBLIC_URL" npm run build:capacitor) || {
  echo -e "${RED}  ERROR: npm run build:capacitor falló${NC}" >&2
  exit 1
}

echo "  [2/3] npx cap sync android ..."
(cd "$PROJECT_DIR" && VITE_API_URL="$API_URL" VITE_TENANT_APPID="$APP_ID" \
  VITE_TENANT_APPNAME="$APP_NAME" VITE_TENANT_BRANDCOLOR="$BRAND_COLOR" \
  npx cap sync android) || {
  echo -e "${RED}  ERROR: cap sync falló${NC}" >&2
  exit 1
}

echo "  [3/3] ./gradlew assembleDebug ..."
(cd "$PROJECT_DIR/android" && ./gradlew assembleDebug 2>&1 | grep -E 'BUILD|FAILED|ERROR') || {
  echo -e "${RED}  ERROR: gradle build falló${NC}" >&2
  exit 1
}

BUILT_APK="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
OUT_DIR="$PROJECT_DIR/dist-apk"
APK="${OUT_DIR}/gestionar-${SLUG}-debug.apk"
echo ""
echo -e "${GREEN}==> Build Android completo.${NC}"
echo "  Tenant: ${SLUG} (applicationId: ${APP_ID})"
echo "  API URL horneada: ${API_URL}"
echo "  Tenant ID horneado: ${TENANT_ID}"
if [[ -f "$BUILT_APK" ]]; then
  mkdir -p "$OUT_DIR"
  cp "$BUILT_APK" "$APK"
  size=$(du -h "$APK" | cut -f1)
  echo -e "  ${GREEN}APK generado:${NC} ${APK} (${size})"
fi
