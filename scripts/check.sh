#!/usr/bin/env bash
# check.sh — Ejecuta las mismas validaciones que CI (lint + typecheck + tests)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=()

run_step() {
    local label="$1"; shift
    echo -e "\n${BLUE}▶ ${label}${NC}"
    if "$@"; then
        echo -e "${GREEN}✅ ${label}${NC}"
    else
        echo -e "${RED}❌ ${label}${NC}"
        ERRORS+=("$label")
    fi
}

# ── 1. Backend lint (ruff) ────────────────────────────────────────────────────
if ! command -v ruff &>/dev/null; then
    echo -e "${YELLOW}⚠️  ruff no encontrado — instalando desde requirements-dev.txt${NC}"
    pip install -q -r backend/requirements-dev.txt
fi
run_step "Backend lint (ruff)" ruff check backend/app/ tests/

# ── 2. Frontend lint (eslint) ─────────────────────────────────────────────────
if [ ! -d frontend/node_modules ]; then
    echo -e "${YELLOW}⚠️  node_modules ausente — ejecutando npm ci${NC}"
    (cd frontend && npm ci --silent)
fi
run_step "Frontend lint (eslint)" bash -c "cd frontend && npm run lint"

# ── 3. Frontend typecheck (tsc) ───────────────────────────────────────────────
run_step "Frontend typecheck (tsc)" bash -c "cd frontend && npx tsc --noEmit -p tsconfig.app.json"

# ── 4. Backend tests (pytest) ─────────────────────────────────────────────────
# Instalar dependencias de test si faltan (motor, redis, pytest-asyncio, httpx)
if ! python -c "import motor" &>/dev/null || ! python -c "import redis" &>/dev/null; then
    echo -e "${YELLOW}⚠️  Dependencias de test ausentes — instalando${NC}"
    pip install -q motor redis pytest pytest-asyncio httpx
fi

# Usa las mismas variables que CI; si no están definidas usa los defaults locales
export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/leadtrackers_test}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export CHROMA_PATH="${CHROMA_PATH:-/tmp/chroma_ci}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-dummy}"
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-dummy}"
export VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-dummy}"
export VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-dummy}"

# Verificar que MongoDB y Redis están levantados antes de correr tests
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "leadtrackers_mongo"; then
    echo -e "${YELLOW}⚠️  leadtrackers_mongo no está corriendo — los tests de infraestructura fallarán${NC}"
    echo -e "   Levanta los servicios con: docker compose up -d mongo redis"
fi

run_step "Backend tests (pytest)" pytest tests/ -v

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
if [ ${#ERRORS[@]} -eq 0 ]; then
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✅ Todas las validaciones pasaron${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e "${RED}  ❌ Fallaron: ${ERRORS[*]}${NC}"
    echo -e "${RED}════════════════════════════════════════${NC}"
    exit 1
fi
