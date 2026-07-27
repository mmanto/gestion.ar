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
window.__TENANT_CONFIG__ = { tenantId: "${TENANT_ID:-}", statsTwoColsMobile: ${STATS_TWO_COLS_MOBILE:-false} };
EOF

# Favicon / íconos PWA por tenant — misma idea que tenant-config.js: la
# imagen es la misma para todos los tenants, así que cada set de íconos se
# hornea en el build bajo tenant-icons/<slug>/ y acá se copia el que
# corresponda sobre las rutas fijas que sirve nginx (/favicon.ico,
# /icons/*). Si falta algún archivo del set (p. ej. tenant sin assets
# todavía) se deja el genérico de ese archivo puntual en vez de fallar el
# arranque del contenedor.
TENANT_ICON_DIR="/usr/share/nginx/html/tenant-icons/${TENANT_SLUG:-}"
if [ -n "$TENANT_SLUG" ] && [ -d "$TENANT_ICON_DIR" ]; then
  for pair in "favicon.ico:/usr/share/nginx/html/favicon.ico" \
              "icon-192.png:/usr/share/nginx/html/icons/icon-192.png" \
              "icon-512.png:/usr/share/nginx/html/icons/icon-512.png" \
              "apple-touch-icon.png:/usr/share/nginx/html/icons/apple-touch-icon.png"; do
    src_name="${pair%%:*}"
    dest="${pair#*:}"
    src="$TENANT_ICON_DIR/$src_name"
    if [ -f "$src" ]; then
      cp "$src" "$dest"
    else
      echo "⚠️  Falta $src — se sirve el favicon genérico para $dest." >&2
    fi
  done
else
  echo "⚠️  No hay set de íconos para TENANT_SLUG='${TENANT_SLUG:-}' — se sirve el favicon genérico." >&2
fi

exec "$@"
