#!/usr/bin/env bash
# lib/colors.sh — Definiciones de colores y helpers de output
# Source este archivo, no lo ejecutes directamente.

# Detectar si stdout es una terminal; desactivar colores si se redirige/pipea
if [[ -t 1 ]]; then
    RED=$'\033[0;31m'
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'
    CYAN=$'\033[0;36m'
    MAGENTA=$'\033[0;35m'
    BOLD=$'\033[1m'
    DIM=$'\033[2m'
    RESET=$'\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' BOLD='' DIM='' RESET=''
fi

log_info()    { printf "${BLUE}[INFO]${RESET}  %s\n" "$*"; }
log_ok()      { printf "${GREEN}[OK]${RESET}    %s\n" "$*"; }
log_warn()    { printf "${YELLOW}[WARN]${RESET}  %s\n" "$*"; }
log_error()   { printf "${RED}[ERROR]${RESET} %s\n" "$*" >&2; }
log_section() { printf "\n${BOLD}${CYAN}=== %s ===${RESET}\n\n" "$*"; }
log_project() { printf "${BOLD}${MAGENTA}--- [%s] ---${RESET}\n" "$*"; }
log_step()    { printf "${DIM}  -> %s${RESET}\n" "$*"; }
