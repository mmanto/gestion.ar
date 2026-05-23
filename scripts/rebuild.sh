#!/usr/bin/env bash
# rebuild.sh — Delegado a docker-ctl.sh para rebuild del proyecto leadtrackers
exec "$(dirname "$(realpath "${BASH_SOURCE[0]}")")/docker-ctl.sh" leadtrackers rebuild "$@"
