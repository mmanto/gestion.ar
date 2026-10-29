#!/bin/bash
# net-check.sh — verifica el DNS que usan los builds (contenedor BuildKit).
#
# Uso: scripts/net-check.sh
# Exit 0 si resuelven pypi.org, download.pytorch.org y github.com.
# Si falla, distingue DNS del daemon (host resuelve) de DNS del VPS (host no).

set -euo pipefail

HOSTS=('pypi.org' 'download.pytorch.org' 'github.com')

if docker run --rm python:3.13-slim python -c \
  "import socket; [socket.getaddrinfo(h, 443) for h in ('pypi.org','download.pytorch.org','github.com')]" \
  >/dev/null 2>&1; then
  echo "DNS del build OK"
  exit 0
fi

echo "ERROR: el contenedor de build no resuelve pypi.org/download.pytorch.org/github.com." >&2
if getent hosts "${HOSTS[0]}" >/dev/null 2>&1; then
  echo "El HOST sí resuelve: el DNS roto es el del daemon de Docker." >&2
  echo "  A) permanente: dns en /etc/docker/daemon.json + systemctl restart docker" >&2
  echo "  B) sin tocar el daemon: make prod-build-host (docker build --network=host)" >&2
else
  echo "El HOST tampoco resuelve: el DNS del VPS está roto." >&2
  echo "  Revisá /etc/resolv.conf o resolvectl status; el build con --network=host tampoco va a funcionar." >&2
fi
exit 1
