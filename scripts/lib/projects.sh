#!/usr/bin/env bash
# lib/projects.sh — Registro centralizado de proyectos Docker Compose
# Source este archivo, no lo ejecutes directamente.

# Mapeo alias -> path absoluto del proyecto
# Los paths están hardcodeados para evitar problemas con el ':' en LeadFlow:padel
declare -gA PROJECT_PATHS=(
    ["leadflow"]="/home/mmanto/Projects/LeadFlow:padel"
    ["cubika"]="/home/mmanto/Projects/cubika"
    ["email"]="/home/mmanto/Projects/email-service"
    ["postgres"]="/home/mmanto/Projects/postgres16"
    ["proxy"]="/home/mmanto/Projects/proxy_gateway"
    ["subse"]="/home/mmanto/Projects/subse_beneficiarios_backend"
)

# Mapeo alias -> nombre del archivo compose (la mayoría .yml, subse usa .yaml)
declare -gA PROJECT_COMPOSE=(
    ["leadflow"]="docker-compose.yml"
    ["cubika"]="docker-compose.yml"
    ["email"]="docker-compose.yml"
    ["postgres"]="docker-compose.yml"
    ["proxy"]="docker-compose.yml"
    ["subse"]="docker-compose.yaml"
)

# Nombres legibles para mostrar en tablas y banners
declare -gA PROJECT_DISPLAY=(
    ["leadflow"]="LeadFlow:padel  (FastAPI + React + Mongo + Redis)"
    ["cubika"]="Cubika           (FastAPI + React + MongoDB)"
    ["email"]="Email-Service    (FastAPI)"
    ["postgres"]="Postgres16       (PostgreSQL 16)"
    ["proxy"]="Proxy Gateway    (Nginx :80/:443)"
    ["subse"]="Subse Backend    (Backend)"
)

# Orden de inicio: infraestructura primero, apps al final
# El orden de parada es el inverso (gestionado en docker-ctl.sh)
PROJECTS_ORDER=(postgres proxy email leadflow cubika subse)

# Devuelve el path completo al archivo compose de un alias
project_compose_file() {
    local alias="$1"
    echo "${PROJECT_PATHS[$alias]}/${PROJECT_COMPOSE[$alias]}"
}

# Retorna 0 si el alias existe en el registro, 1 si no
project_exists() {
    local alias="$1"
    [[ -n "${PROJECT_PATHS[$alias]+set}" ]]
}

# Retorna 0 si el archivo compose existe en disco, 1 si no
compose_file_exists() {
    local alias="$1"
    local compose_file
    compose_file="$(project_compose_file "$alias")"
    [[ -f "$compose_file" ]]
}
