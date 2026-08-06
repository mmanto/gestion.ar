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
