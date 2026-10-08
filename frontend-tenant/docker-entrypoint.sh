#!/bin/sh
set -e

# Un único contenedor frontend-tenant sirve a todos los tenants: el tenant se
# resuelve por el Host de la request (GET /api/public/tenants/current, que
# matchea tenants.domain), no por env vars por contenedor. Los íconos PWA por
# tenant los sirve nginx vía map $http_host (ver nginx.conf).
exec "$@"
