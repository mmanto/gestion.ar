 Diagnóstico

 El backend crea la sesión de Nango en la instancia pública (api.nango.intellify.pro, tu log muestra 201), pero los frontends-tenant ius/erma corriendo tienen horneado localhost:3009/3003 (fallback de dev). Lo
 confirmé en los contenedores gestionar_frontend_tenant_ius/_erma: su bundle JS solo contiene localhost:3009 y localhost:3003, nada de nango.intellify.pro.

 El docker-compose.tenants.local.yml construía esos frontends sin pasar VITE_NANGO_CONNECT_URL/VITE_NANGO_API_URL, así que caían al default hardcodeado. Resultado: el Connect UI del browser abre contra localhost
 mientras la sesión se creó en la instancia pública → el token de sesión se rechaza ("Your session has expired") y el login con gmail muere. Es exactamente el modo de falla de ADR-012, que "volvió" porque estos
 frontends se reconstruyeron sin las URLs públicas.

 Cambios de config (ya aplicados en el repo, sin reconstruir)

 - docker-compose.tenants.local.yml: agregué VITE_NANGO_CONNECT_URL=https://nango.intellify.pro y VITE_NANGO_API_URL=https://api.nango.intellify.pro como build args de frontend-tenant-ius y frontend-tenant-erma.
 - docker-compose.tenants.dev.yml: las mismas URLs como environment en los dos dev-servers (el dev-server lee VITE_* de env en runtime).
 - YAML validado: args presentes en los 4 servicios.

 Comandos para aplicar el fix (rebuild ius + erma)

 ```bash
cd /home/mmanto/workspace/gestion.ar

# 1) Reconstruir imágenes con las URLs públicas horneadas
docker compose -f docker-compose.tenants.local.yml build frontend-tenant-ius frontend-tenant-erma

# 2) Recrear los contenedores
docker compose -f docker-compose.tenants.local.yml up -d frontend-tenant-ius frontend-tenant-erma

# 3) Verificar que ya NO quede localhost:3009/3003 en el bundle servido
docker exec gestionar_frontend_tenant_ius sh -c 'grep -ro "nango.intellify.pro\|localhost:300[39]" /usr/share/nginx/html/assets || echo OK'
 ```

 Condición para que funcione (alineación de instancia)

 El frontend ahora apunta a la instancia pública, así que el backend debe crear la sesión en la misma instancia. Tu log ya muestra que llega a api.nango.intellify.pro (correcto). En el repo, .env.dev tiene
 NANGO_HOST=http://nango-server:8080 (interno) — si alguno de tus entornos usa ese valor, el backend y el frontend quedarían en instancias distintas y el login seguiría fallando. Asegurate de que NANGO_HOST =
 https://api.nango.intellify.pro en el entorno que testeás (y el NANGO_SECRET_KEY correspondiente a esa instancia), igual que en .env.prod.

 Resolución (2026-08-12): el mismatch se había vuelto a presentar — .env.dev
 apuntaba de nuevo a la instancia interna (NANGO_HOST=http://nango-server:8080,
 secret local) mientras los frontends-tenant ius/erma hornean las URLs públicas.
 Resultado: la sesión se creaba local pero el Connect UI público la rechazaba
 (401 en /connect/session) → la integración de Google no se resolvía y el botón
 salía en modo demo ("Conecta este botón a tu proveedor de Google OAuth. (demo)").

 .env.dev se volvió a alinear a la instancia pública:
     NANGO_HOST=https://api.nango.intellify.pro
     NANGO_SECRET_KEY=40a9dfe1-94bf-44c8-ae04-7f63a24d1800   (igual que .env.prod)
 Tras reiniciar `app` y los nginx de frontend (la recreación del contenedor
 cambió su IP y los nginx cachean el upstream `app` al arrancar → 502 temporal;
 reiniciarlos re-resuelve), el flujo local quedó: login/session 200,
 /connect/session 200, /integrations 200 → botón real "Connect", sin demo.

 Prod verificado (2026-08-12, ius.intellify.pro): la integración `google-mail`
 en la Nango pública resuelve el provider y renderiza el botón "Link Gmail
 Account / Connect" — NO está en modo demo. La integración pública está OK; el
 "(demo)" era exclusivamente el mismatch local.
