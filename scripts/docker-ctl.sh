#!/usr/bin/env bash
# docker-ctl.sh — CLI de gestión de Docker Compose para todos los proyectos
#
# USO:
#   docker-ctl.sh <proyecto> <comando> [servicio]
#   docker-ctl.sh <comando-global>
#
# PROYECTOS:  gestionar | cubika | email | postgres | proxy | subse
# COMANDOS:   up | down | restart | rebuild | status | logs | pull
# GLOBALES:   up-all | down-all | restart-all | status-all | help
#
# EJEMPLOS:
#   ./docker-ctl.sh gestionar up
#   ./docker-ctl.sh gestionar logs app
#   ./docker-ctl.sh gestionar rebuild
#   ./docker-ctl.sh up-all
#   ./docker-ctl.sh status-all

set -euo pipefail

# Resolver el directorio del script (funciona aunque se llame desde un symlink)
SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"

# Cargar librerías compartidas
# shellcheck source=lib/colors.sh
source "${LIB_DIR}/colors.sh"
# shellcheck source=lib/projects.sh
source "${LIB_DIR}/projects.sh"

SCRIPT_NAME="$(basename "$0")"
MIN_BASH_VERSION=4

# Verificar versión de bash (arrays asociativos requieren bash 4+)
if (( BASH_VERSINFO[0] < MIN_BASH_VERSION )); then
    printf '[ERROR] Se requiere bash %s+ (encontrado %s).\n' "$MIN_BASH_VERSION" "$BASH_VERSION" >&2
    printf '        En macOS: brew install bash\n' >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# show_help
# ---------------------------------------------------------------------------
show_help() {
    cat <<HELP

${BOLD}${CYAN}Docker Compose Manager${RESET}
${DIM}Gestiona Docker Compose para todos los proyectos.${RESET}

${BOLD}USO${RESET}
  ${SCRIPT_NAME} <proyecto>  <comando>  [servicio]
  ${SCRIPT_NAME} <comando-global>

${BOLD}PROYECTOS${RESET}
  gestionar   Gestionar   (FastAPI + React + Mongo + Redis)
  cubika     Cubika           (FastAPI + React + MongoDB)
  email      Email-Service    (FastAPI standalone)
  postgres   Postgres16       (PostgreSQL 16)
  proxy      Proxy Gateway    (Nginx :80/:443)
  subse      Subse Backend    (Backend)

${BOLD}COMANDOS POR PROYECTO${RESET}
  up         Iniciar servicios en background
  down       Detener y eliminar contenedores
  restart    Reiniciar servicios (preserva volúmenes)
  rebuild    Build --no-cache + recrear contenedores
  status     Estado de contenedores (docker compose ps)
  logs       Seguir logs  (opcional: pasar nombre de servicio)
  pull       Pull de imágenes base

${BOLD}COMANDOS GLOBALES${RESET}
  up-all       Iniciar todos los proyectos en orden
  down-all     Detener todos en orden inverso
  restart-all  Reiniciar todos los proyectos
  status-all   Tabla de estado de todos los proyectos
  help         Mostrar esta ayuda

${BOLD}EJEMPLOS${RESET}
  ${SCRIPT_NAME} gestionar up
  ${SCRIPT_NAME} gestionar logs app
  ${SCRIPT_NAME} gestionar rebuild
  ${SCRIPT_NAME} postgres status
  ${SCRIPT_NAME} up-all
  ${SCRIPT_NAME} status-all

HELP
}

# ---------------------------------------------------------------------------
# run_compose <alias> [...args de docker compose]
# Wrapper de docker compose con -f y cd al directorio del proyecto
# ---------------------------------------------------------------------------
run_compose() {
    local alias="$1"
    shift
    local compose_file
    compose_file="$(project_compose_file "$alias")"
    local project_dir="${PROJECT_PATHS[$alias]}"

    log_step "docker compose -f \"${compose_file}\" $*"

    # cd al directorio del proyecto para que los paths relativos en compose funcionen
    (
        cd "${project_dir}" || { log_error "No se puede acceder a ${project_dir}"; exit 1; }
        docker compose -f "${compose_file}" "$@"
    )
}

# ---------------------------------------------------------------------------
# Comandos por proyecto
# ---------------------------------------------------------------------------
cmd_up() {
    local alias="$1"
    log_section "Iniciando ${PROJECT_DISPLAY[$alias]}"
    run_compose "$alias" up -d
    log_ok "Servicios iniciados."
}

cmd_down() {
    local alias="$1"
    log_section "Deteniendo ${PROJECT_DISPLAY[$alias]}"
    run_compose "$alias" down
    log_ok "Servicios detenidos."
}

cmd_restart() {
    local alias="$1"
    log_section "Reiniciando ${PROJECT_DISPLAY[$alias]}"
    run_compose "$alias" restart
    log_ok "Servicios reiniciados."
}

cmd_rebuild() {
    local alias="$1"
    log_section "Rebuild de ${PROJECT_DISPLAY[$alias]} (sin caché)"
    log_step "Actualizando imágenes base..."
    run_compose "$alias" pull --ignore-pull-failures 2>/dev/null || true
    log_step "Construyendo imágenes (--no-cache)..."
    run_compose "$alias" build --no-cache
    log_step "Iniciando servicios..."
    run_compose "$alias" up -d --force-recreate
    log_ok "Rebuild completo."
}

cmd_status() {
    local alias="$1"
    log_section "Estado: ${PROJECT_DISPLAY[$alias]}"
    run_compose "$alias" ps
}

cmd_logs() {
    local alias="$1"
    local service="${2:-}"
    log_section "Logs: ${PROJECT_DISPLAY[$alias]}${service:+ / ${service}}"
    if [[ -n "$service" ]]; then
        run_compose "$alias" logs -f --tail=100 "$service"
    else
        run_compose "$alias" logs -f --tail=100
    fi
}

cmd_pull() {
    local alias="$1"
    log_section "Pull de imágenes: ${PROJECT_DISPLAY[$alias]}"
    run_compose "$alias" pull
    log_ok "Imágenes actualizadas."
}

# ---------------------------------------------------------------------------
# validate_project <alias>
# Verifica que el alias exista y que el archivo compose esté en disco
# ---------------------------------------------------------------------------
validate_project() {
    local alias="$1"
    if ! project_exists "$alias"; then
        log_error "Proyecto desconocido: '${alias}'"
        printf "  Proyectos válidos: %s\n" "${!PROJECT_PATHS[*]}" >&2
        printf "  Ejecuta: %s help\n" "$SCRIPT_NAME" >&2
        exit 1
    fi
    if ! compose_file_exists "$alias"; then
        log_error "Archivo compose no encontrado: $(project_compose_file "$alias")"
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# run_for_all <comando> [reverse=true|false]
# Itera PROJECTS_ORDER (o en reversa) ejecutando el comando en cada proyecto
# Los errores se capturan; al final se muestra un resumen
# ---------------------------------------------------------------------------
run_for_all() {
    local cmd="$1"
    local reverse="${2:-false}"

    local -a order=("${PROJECTS_ORDER[@]}")
    if [[ "$reverse" == "true" ]]; then
        local -a reversed=()
        for (( i=${#order[@]}-1; i>=0; i-- )); do
            reversed+=("${order[$i]}")
        done
        order=("${reversed[@]}")
    fi

    local -a failed=()

    for alias in "${order[@]}"; do
        log_project "${alias} / ${PROJECT_DISPLAY[$alias]}"

        if ! compose_file_exists "$alias"; then
            log_warn "Archivo compose no encontrado para '${alias}', saltando."
            echo ""
            continue
        fi

        if ! "cmd_${cmd}" "$alias"; then
            log_warn "El comando '${cmd}' falló para '${alias}'"
            failed+=("$alias")
        fi
        echo ""
    done

    if (( ${#failed[@]} > 0 )); then
        log_warn "Proyectos con errores: ${failed[*]}"
        return 1
    else
        log_ok "Todos los proyectos: ${cmd} completado."
    fi
}

# ---------------------------------------------------------------------------
# global_status_all
# Muestra una tabla compacta del estado de todos los proyectos
# ---------------------------------------------------------------------------
global_status_all() {
    log_section "Estado: Todos los Proyectos"
    for alias in "${PROJECTS_ORDER[@]}"; do
        log_project "${PROJECT_DISPLAY[$alias]}"
        if ! compose_file_exists "$alias"; then
            log_warn "  Archivo compose no encontrado, saltando."
            echo ""
            continue
        fi
        run_compose "$alias" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
        echo ""
    done
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
    if (( $# == 0 )); then
        show_help
        exit 0
    fi

    local first_arg="$1"

    # Comandos globales (no requieren argumento de proyecto)
    case "$first_arg" in
        help|--help|-h)
            show_help
            exit 0
            ;;
        up-all)
            run_for_all "up" "false"
            exit $?
            ;;
        down-all)
            # Orden inverso: apps primero, infraestructura al final
            run_for_all "down" "true"
            exit $?
            ;;
        restart-all)
            run_for_all "restart" "false"
            exit $?
            ;;
        status-all)
            global_status_all
            exit 0
            ;;
    esac

    # Comandos por proyecto: requieren <proyecto> <comando> [servicio]
    if (( $# < 2 )); then
        log_error "Los comandos por proyecto requieren: ${SCRIPT_NAME} <proyecto> <comando>"
        show_help
        exit 1
    fi

    local project="$1"
    local command="$2"
    local service="${3:-}"

    validate_project "$project"

    case "$command" in
        up)        cmd_up      "$project" ;;
        down)      cmd_down    "$project" ;;
        restart)   cmd_restart "$project" ;;
        rebuild)   cmd_rebuild "$project" ;;
        status)    cmd_status  "$project" ;;
        logs)      cmd_logs    "$project" "$service" ;;
        pull)      cmd_pull    "$project" ;;
        *)
            log_error "Comando desconocido: '${command}'"
            printf "  Comandos válidos: up | down | restart | rebuild | status | logs | pull\n" >&2
            exit 1
            ;;
    esac
}

main "$@"
