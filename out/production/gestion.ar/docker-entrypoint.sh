#!/bin/sh
set -e

# Cada contenedor de frontend-tenant sirve a UN solo tenant, conocido recién
# al momento del deploy — se inyecta acá en vez de hornearlo en la imagen,
# así se reutiliza la MISMA imagen para todos los tenants (ver estrategia
# multi-tenant, Fase 7). TenantContext lo lee como window.__TENANT_CONFIG__.
if [ -z "$TENANT_ID" ]; then
  echo "⚠️  TENANT_ID no está seteado — este contenedor no va a resolver ningún tenant." >&2
fi

cat > /usr/share/nginx/html/tenant-config.js <<EOF
window.__TENANT_CONFIG__ = { tenantId: "${TENANT_ID:-}" };
EOF

exec "$@"
