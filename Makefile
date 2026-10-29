# Makefile del stack gestion.ar.
# Entrada única de desarrollo y producción (convención DevBout: `make`, no
# wrappers ./stack.*). `make` o `make help` lista los comandos.
#
# La lógica no trivial (health checks, limpieza, APK Android) vive en
# scripts/*.sh y este Makefile la orquesta.

.DEFAULT_GOAL := help
SHELL := /bin/bash

ENV_DEV  ?= .env.dev
ENV_PROD ?= .env.prod

# ── Compose ───────────────────────────────────────────────────────────────
# Cada receta carga su propio --env-file: las variables del host no contaminan
# la URL de Postgres ni el resto del stack.
COMPOSE_DEV := docker compose --env-file $(ENV_DEV) \
	-f docker-compose.yml -f docker-compose.dev.yml \
	-f docker-compose.tenants.local.yml
# Override personal (ignorado por git), si existe.
ifneq (,$(wildcard docker-compose.override.yml))
COMPOSE_DEV += -f docker-compose.override.yml
endif
ifneq (,$(filter 1 true yes,$(TENANT_HOT_RELOAD)))
COMPOSE_DEV += -f docker-compose.tenants.dev.yml
endif

COMPOSE_PROD := docker compose --env-file $(ENV_PROD) \
	-f docker-compose.yml -f docker-compose.prod.yml \
	-f docker-compose.tenants.prod.yml

# BuildKit/Bake: paraleliza los builds de los servicios y comparte caché.
# COMPOSE_BAKE=0 lo desactiva si el Docker Compose del host es viejo.
COMPOSE_BAKE ?= true

# ── Parámetros opcionales ─────────────────────────────────────────────────
# make logs SERVICE=app · make rebuild SERVICE=frontend
SERVICE ?=
# make build-android TENANT=ius TARGET=device API_URL=http://192.168.1.50:8000/api
TENANT  ?= ius
TARGET  ?= emulator
API_URL ?=
# make clean MODE=deep
MODE ?= light

.PHONY: help urls up down reset restart rebuild build logs ps status shell test config clean \
	build-android prod-check prod-up prod-down prod-restart prod-rebuild prod-build \
	prod-logs prod-ps prod-status prod-shell prod-config prod-clean \
	prod-build-android

# ── Ayuda ─────────────────────────────────────────────────────────────────

help:
	@echo "gestion.ar — stack de desarrollo (prod: prefijo prod-)"
	@echo
	@echo "Desarrollo:"
	@echo "  make up                    levantar el stack y esperar healthy"
	@echo "  make down                  bajar el stack (conserva los datos)"
	@echo "  make reset                 bajar y borrar volumenes (down -v)"
	@echo "  make restart [SERVICE=]    reiniciar todo o un servicio"
	@echo "  make rebuild [SERVICE=]    reconstruir imagenes y levantar"
	@echo "  make build [SERVICE=]      construir imagenes sin levantar"
	@echo "  make logs [SERVICE=]       seguir logs (todos o uno)"
	@echo "  make ps                    estado de los contenedores"
	@echo "  make status                ps + health checks"
	@echo "  make shell SERVICE=app     shell dentro de un servicio"
	@echo "  make test                  pytest dentro de app"
	@echo "  make config                validar el compose de desarrollo"
	@echo "  make clean [MODE=]         light (default) | deep | all"
	@echo "  make build-android TENANT=ius TARGET=emulator [API_URL=...]"
	@echo "  TENANT_HOT_RELOAD=1 make rebuild   tenants con Vite hot-reload"
	@echo
	@echo "Produccion:"
	@echo "  make prod-up | prod-down | prod-restart [SERVICE=] | prod-rebuild"
	@echo "  make prod-build [SERVICE=] | prod-logs [SERVICE=] | prod-ps | prod-status"
	@echo "  make prod-shell SERVICE=app | prod-config"
	@echo "  make prod-clean [MODE=light|images]"
	@echo "  make prod-build-android TENANT=... TARGET=emulator|device|prod [API_URL=...]"
	@echo
	@echo "Servicios dev: app frontend postgres redis traefik frontend-tenant landing"
	@echo "Servicios prod: app frontend frontend-tenant landing"
	@echo
	@echo "Accesos (desarrollo):"
	@echo "  Admin:   http://localhost:5173"
	@echo "  API:     http://localhost:8000 (docs: /docs)"
	@echo "  erma:    http://erma.com.test"
	@echo "  ius:     http://ius.mx.test"
	@echo "  pachote: http://pachoteayuda.ar.localhost"

urls:
	@echo "Admin:   http://localhost:5173"
	@echo "API:     http://localhost:8000 (docs: /docs)"
	@echo "erma:    http://erma.com.test"
	@echo "ius:     http://ius.mx.test"
	@echo "pachote: http://pachoteayuda.ar.localhost"

# ── Desarrollo ────────────────────────────────────────────────────────────

up:
	@./scripts/preflight.sh dev
	$(COMPOSE_DEV) up -d --wait
	@$(MAKE) --no-print-directory urls

down:
	$(COMPOSE_DEV) down

reset:
	$(COMPOSE_DEV) down -v

restart:
	@./scripts/preflight.sh dev
	$(COMPOSE_DEV) restart $(SERVICE)

rebuild: build
	$(COMPOSE_DEV) up -d --wait $(SERVICE)

build:
	@./scripts/preflight.sh dev
	COMPOSE_BAKE=$(COMPOSE_BAKE) $(COMPOSE_DEV) build $(SERVICE)

logs:
	$(COMPOSE_DEV) logs -f --tail=100 $(SERVICE)

ps:
	$(COMPOSE_DEV) ps

status:
	@./scripts/status.sh dev

shell:
	@test -n "$(SERVICE)" || { echo "Usar: make shell SERVICE=app"; exit 1; }
	$(COMPOSE_DEV) exec $(SERVICE) sh

test:
	$(COMPOSE_DEV) exec app pytest -q

config:
	$(COMPOSE_DEV) config --quiet

clean:
	@./scripts/clean.sh dev "$(MODE)"

build-android:
	@./scripts/android-build.sh dev "$(TENANT)" "$(TARGET)" "$(API_URL)"

# ── Producción ────────────────────────────────────────────────────────────

prod-check:
	@./scripts/preflight.sh prod

prod-up: prod-check
	$(COMPOSE_PROD) up -d --wait

prod-down:
	$(COMPOSE_PROD) down

prod-restart: prod-check
	$(COMPOSE_PROD) restart $(SERVICE)

prod-rebuild: prod-build
	$(COMPOSE_PROD) up -d --wait $(SERVICE)

prod-build: prod-check
	COMPOSE_BAKE=$(COMPOSE_BAKE) $(COMPOSE_PROD) build $(SERVICE)

prod-logs: prod-check
	$(COMPOSE_PROD) logs -f --tail=100 $(SERVICE)

prod-ps: prod-check
	$(COMPOSE_PROD) ps

prod-status: prod-check
	@./scripts/status.sh prod

prod-shell: prod-check
	@test -n "$(SERVICE)" || { echo "Usar: make prod-shell SERVICE=app"; exit 1; }
	$(COMPOSE_PROD) exec $(SERVICE) sh

prod-config: prod-check
	$(COMPOSE_PROD) config --quiet

prod-clean:
	@./scripts/clean.sh prod "$(MODE)"

prod-build-android: prod-check
	@./scripts/android-build.sh prod "$(TENANT)" "$(TARGET)" "$(API_URL)"
