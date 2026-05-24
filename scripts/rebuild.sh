#!/usr/bin/env bash
# rebuild.sh — Delegado a docker-ctl.sh para rebuild del proyecto gestionar
exec "$(dirname "$(realpath "${BASH_SOURCE[0]}")")/docker-ctl.sh" gestionar rebuild "$@"
