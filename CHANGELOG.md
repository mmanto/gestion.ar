# CHANGELOG.md

Historial de cambios del proyecto. Seguir el formato [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Sin versión] - En desarrollo

### Cambiado
- **Navegación mobile del dashboard (app Android y web < `md`):** el menú de la
  aplicación ya no se abre por hamburguesa/drawer lateral — la sidebar es solo
  desktop y, en mobile, el **menú del avatar es el menú de la aplicación**
  (lleva los links de navegación del panel). Se quitaron el drawer mobile del
  template default y del template kero. En Ajustes también se eliminó la
  opción "Mostrar la barra lateral de navegación" (el campo `sidebar_visible`
  del branding queda en el modelo, sin control en la UI).

### Corregido
- **App Android — los widgets de turnos (Module Federation) no cargaban en el
  dispositivo:** el build de Capacitor (`vite build --mode capacitor`) no carga
  `.env.dev`/`.env.prod`, y los scripts `stack-dev.sh`/`stack-prod.sh` no
  inyectaban `VITE_APPOINTMENTS_REMOTE_URL`, así que el fallback de
  `vite.config.ts` (`http://localhost:5180/remoteEntry.js`) quedaba horneado en
  el APK — inalcanzable desde el celular (`Failed to fetch`). Ahora ambos
  scripts derivan la URL del remote desde el host del backend (`:8180`, mismo
  patrón que Nango) u la sobreescriben con `VITE_APPOINTMENTS_REMOTE_URL`, y el
  fallback de config pasó a ser la URL de prod. Requiere rebuild + reinstall
  del APK.

### Corregido
- **Login OAuth nativo (Android) — el webhook de Nango ya no es un SPOF:**
  diagnosticado en prod (2026-08-09) — el pipeline backend completo funciona
  con datos reales (webhook firmado 200, session→webhook→status entrega el
  resultado, y se completó un login end-to-end con una conexión real de
  Google), pero **la entrega del webhook de Nango al backend no llega**: las
  45 conexiones de intentos fallidos existen en Nango (creadas por el Custom
  Tab con `endUser.id = tsignup_…`) y ningún login se completó. Sospecha:
  hairpin NAT/DNS del container de Nango en el VPS (ver RUNBOOK). Fix: el
  status endpoint ahora **resuelve el login activamente por pull** — cuando
  está pendiente, busca la connection en Nango por `endUser.id`
  (`GET /connection?endUserId=`) y completa el login sin depender del
  webhook; el webhook queda como camino rápido (resuelve antes si llega).
  **Requiere redeploy del backend.** El frontend no cambia (el poll ya existe).

### Corregido
- **Login OAuth nativo (Android) — vuelta al login tras autorizar en Google:**
  el endpoint `/tenant/oauth/connect/login/status` hacía fetch-and-delete del
  resultado (single-use), y la primera request de la WebView tras retomar del
  Chrome Custom Tab se aborta — si esa request había consumido el resultado,
  el login quedaba `pending` para siempre aunque el webhook de Nango lo hubiera
  resuelto. Ahora el status endpoint **lee sin consumir** (peek): el retry del
  poll vuelve a leer el resultado intacto, y la exposición queda acotada por el
  TTL (5 min) y el nonce firmado. Además, el listener de `browserFinished` se
  registra **antes** de `Browser.open` para no perder el cierre del tab. Se
  verificó en prod (2026-08-09): el secret de `NANGO_WEBHOOK_SECRET` valida
  correctamente un webhook firmado (200) y el loop
  session→webhook→status→resultado funciona; el error
  `Item with given key does not exist` de SecureStorage en el log es ruido del
  interceptor de axios, no la causa. **Requiere redeploy del backend y rebuild
  del APK.** Falta confirmar en el dashboard de Nango que la Webhook URL y el
  evento auth estén activados (única pieza no verificable desde el servidor).

### Corregido
- **Login OAuth nativo (Android):** se diagnosticó la causa raíz del "cancelled"
  persistente. El flujo mobile depende de que Nango entregue el webhook de auth
  al backend (`POST /api/tenant/oauth/webhook/nango`) para resolver
  `/tenant/oauth/connect/login/status`; si la **Webhook URL del environment no
  está configurada** en el Nango self-hosted (`primary_url` vacío en
  `_nango_external_webhooks`), Nango no envía **ningún** webhook y el login
  queda `pending` para siempre → la app mostraba un fallo silencioso y volvía
  al login. Cambios: (1) el backend ahora loguea cada webhook recibido y su
  resolución/omisión (antes el `no hay login pendiente` / éxito eran mudos);
  (2) la app ya no traduce este fallo a "cancelled" silencioso, sino a un
  mensaje accionable; (3) se documentó la configuración del webhook en
  `docs/dev/SETUP.md` y su diagnóstico en `docs/ops/RUNBOOK.md`. **Configuración
  requerida en servidor:** activar la Webhook URL de Nango
  (`https://api.intellify.pro/api/tenant/oauth/webhook/nango`) + evento auth.

### Corregido
- **Login OAuth nativo (Android):** el polling a
  `/tenant/oauth/connect/login/status` fallaba por dos motivos: (1) moría con
  `AxiosError: Network Error` al volver del Chrome Custom Tab — la primera
  request tras retomar la WebView se aborta y, al no manejar errores de red, se
  tiraba todo el login; ahora esos errores se reintentan hasta el deadline. (2)
  se marcaba "cancelado" en el primer poll "pending" tras el cierre del tab,
  pero ese cierre también ocurre cuando el OAuth termina — el webhook de Nango
  a veces tardaba un instante en marcar `done` y el login se cancelaba igual;
  ahora se espera una ventana de gracia de 8 s antes de dar por cancelado. (3)
  además, el `tenant_oauth_router` verificaba el webhook contra
  `X-Nango-Signature`, que Nango genera como `sha256(secret+body)` (legacy) —
  el backend calcula un HMAC, así que nunca coincidía y el webhook moría en 401
  sin resolver el login. Ahora verifica `X-Nango-Hmac-Sha256` (HMAC-SHA256 hex),
  el header que coincide con el algoritmo usado.

### Agregado
- **Login con huella dactilar (app nativa Android):** el staff puede iniciar
  sesión con su huella en lugar de usuario+contraseña. En Settings se habilita
  "Acceso con huella" (genera un secreto cifrado en el Keystore bajo la huella
  y registra su hash en el backend); desde el login se entra con la huella sin
  escribir credenciales. Se pueden gestionar/revocar dispositivos. Backend:
  tabla `device_credentials` + endpoints `/api/auth/biometric/{enroll,login,devices}`
  (ver ADR-014). Plugin nativo `BiometricAuth` con `androidx.biometric`.

- **Plan y estado de suscripción en el menú del avatar:** el menú del usuario
  (frontend-tenant) muestra el plan al que está suscripto y su estado
  (Pendiente/Aprobado/Vigente). `/auth/me` ahora devuelve `requested_plan_id`,
  `subscription_status` y `plan_name`.

### Agregado
- **Gestión de suscripción por el admin del tenant:** el admin (p.ej. ius)
  puede modificar el **estado de la suscripción** del plan de cada usuario
  (`pending` → `approved`/`active`) desde la gestión de usuarios del panel
  (`PATCH /api/tenant/users/{username}`), además de editar/dar de baja
  usuarios. Ver ADR-013.

### Agregado
- **Asignación de suscripción en el alta por gmail (tenant ius):** al darse de
  alta por gmail/formulario se asigna el plan elegido (`mensual` → **Pro
  Mensual**, `anual` → **Pro Anual**), seedeados en el catálogo
  (`plan_pro_mensual` / `plan_pro_anual`). La resolución elige el plan pagado
  de la periodicidad en lugar del Plan Básico por defecto; queda en estado
  Pendiente y la aprobación es manual (ver ADR-013).

### Agregado
- **Borrado de usuario del propio tenant:** `DELETE /api/tenant/users/{username}`
  (admin del tenant), para quitar cuentas de prueba creadas por autoregistro/
  gmail en desarrollo. Siempre scoped al tenant; no permite borrarse a sí
  mismo.

### Agregado
- **Registro del plan solicitado en el alta (estado Pendiente):** al darse de
  alta un usuario por autoregistro (formulario "Crea tu cuenta" o gmail), el
  plan que quiere suscribirse se registra **sobre el usuario** en estado
  **Pendiente** (`requested_plan_id` + `subscription_status='pending'`). Cada
  usuario elige y paga su propio plan. El pase a aprobado/vigente es **manual**
  (super_admin) vía el nuevo endpoint `PATCH /api/admin/users/{username}/plan-request`
  (ver ADR-013). El detalle del tenant muestra las solicitudes pendientes por
  usuario y permite aprobarlas.
### Implementado
- Bot multi-canal: WhatsApp (Meta + Twilio), Telegram, Web (WebSocket), PWA
- Sistema RAG con ChromaDB y sentence-transformers
- Integración con Claude API (Anthropic) y Ollama como proveedores LLM intercambiables
- Gestión de bots, canales y clientes por propietario (JWT)
- Flujo conversacional progresivo para captura de datos (LeadTrackers)
- Push Notifications via VAPID para canal PWA
- Agente IUS para embudo de conversión de servicios legales laborales
- Dashboard frontend con React + Vite + Tailwind
- Docker Compose para entorno de desarrollo y producción

### Agregado
- **Pantalla de registro "Crea tu cuenta" en `frontend-tenant`** (`/registro`):
  autoregistro público de un admin del tenant con selección de plan
  (mensual/anual), login con Google y formulario nombre/correo/contraseña con
  términos — réplica del bloque de la landing ius. Se apoya en
  `POST /api/auth/register` (antes deprecado), que crea el usuario y devuelve
  token JWT + URL de pago de Mercado Pago del plan (`payment.url`).
- **Landing ius embebe el registro real (micro-frontend):** el bloque de
  registro estático de `sites/ius-landing/registro.html` (demo, no creaba
  cuentas) se reemplazó por el mismo `RegisterForm` del panel, compilado a un
  bundle autocontenido (`npm run build:embed` → `register-embed.js`, servido
  por la landing en `/register-embed.js`). El formulario crea el admin y
  redirige al pago real de Mercado Pago del plan; Google login idem al panel.
- **App Android nativa del staff de ius (ADR-007), Capacitor:** empaqueta el
  mismo panel de `frontend-tenant/` (`appId: ius.intellify.pro`, `appName:
  'ius Staff'`) tal cual, sin fork de build ni de componentes — un solo
  target (`npm run build:capacitor`), tenant fijo horneado en build vía
  `bake-tenant-config.mjs`, y todo lo nativo (back button, push, secure
  storage, status bar/splash) agregado como progressive enhancement detrás
  de `Capacitor.isNativePlatform()`. Comando `build-android` en
  `stack.dev`/`stack.prod`
- **Push a staff cuando un cliente escribe**, en los tres canales (Web,
  WhatsApp, Telegram): `notify_staff_of_client_message()` combina WS en
  tiempo real (`/ws/staff/chat/{bot_id}`) + push nativo/VAPID para staff en
  background o con la app cerrada
- **Push multi-plataforma:** `push_service.py` rutea notificaciones por
  `platform` (vapid/fcm/apns). Nuevo endpoint autenticado
  `POST /api/pwa/subscribe-staff` (deriva `user_id` siempre del JWT, nunca
  del body) para que el staff registre su device token nativo sin poder
  suscribirse con la identidad de otro miembro del staff
- JWT del staff en Capacitor Secure Storage (Keychain/Keystore) en nativo,
  no en `localStorage`
- Nuevas dependencias: `@capacitor/core`, `@capacitor/android`,
  `@capacitor/push-notifications`, `@capacitor/app`,
  `@capacitor/splash-screen`, `@capacitor/status-bar`,
  `capacitor-secure-storage-plugin`, `firebase-admin`, `aioapns`
- Migración Alembic: `push_subscriptions` extiende con `platform`,
  `device_token`, `user_id` (FK a users)
- Documentación: ADR-007 en `docs/dev/DECISIONS.md`, contratos WebSocket en
  `docs/dev/API.md`, modelo actualizado en `docs/dev/DATA_MODEL.md`. Estado
  y pendientes (prueba en dispositivo real, firma de release, iOS) en
  `docs/dev/MOBILE.md`.
- App del **cliente final** (quien le escribe al bot): proyecto aparte, no
  incluido acá

- **Branding de tenant autogestionable:** endpoints `POST /api/tenant/branding/logo`, `PATCH /api/tenant/branding`, `DELETE /api/tenant/branding/logo` para que el admin del tenant suba su logo, defina color principal y tagline. Se refleja en Landing y Login del frontend-tenant. El super_admin también puede editar branding desde el panel de administración general (`TenantDetail`). Nuevo componente `BrandingSection` en `frontend-tenant/src/pages/Settings.tsx`.

### Implementado
- Sistema de notificaciones toast (`useToast`) enganchado al interceptor de errores de `api.ts`: cualquier error de una petición al backend (validación, conflicto, red, etc.) ahora se le informa siempre al usuario, en vez de quedar solo en la consola del navegador (ej. dar de alta un usuario con un nombre ya existente no mostraba ningún aviso)

### Corregido
- Páginas HTML de las landings (`sites/*/nginx.conf`): no emitían
  `Cache-Control`, así que nginx aplicaba caché heurística y el navegador
  guardaba una copia por URL (query incluido). Tras un deploy, una URL ya
  visitada (p.ej. `registro.html?plan=anual`) podía seguir mostrando una
  versión vieja mientras otra no visitada (`?plan=mensual`) traía la actual —
  daba la impresión de que "sólo cambia el parámetro" pero una fallaba.
  Ahora todo `.html` de la landing se sirve con `Cache-Control: no-cache`
  (revalida por ETag); los assets estáticos mantienen `expires 1y, immutable`.
- Ruteo Traefik de las landings que comparten dominio con el tenant
  (`docker-compose.tenants.prod.yml` / `.local.yml`): los routers `landing-*`
  matcheaban una lista fija de paths, así que cualquier página `.html` nueva
  (p.ej. `contacto.html`) caía en el SPA del tenant y su nginx la reemplazaba
  por `index.html`, quedando "invisible". Ahora usan `PathRegexp(^/.*\.html$)`
  → cualquier `.html` de la landing la sirve su propio contenedor, sin
  editar la regla por cada archivo.
- Build Android nativo (`cmd_build_android` en `stack.dev`/`stack.prod`): no seteaba `VITE_STATS_TWO_COLS_MOBILE`, por lo que `bake-tenant-config.mjs` horneaba `statsTwoColsMobile: false` en el APK — el dashboard mostraba las stat cards en 1 columna en el celular en vez de 2, a diferencia de la web de `ius` (que sí seteaba `STATS_TWO_COLS_MOBILE=true` vía `docker-compose.tenants.*.yml`)
- Dropdown de tenant al crear un agente (`frontend/src/pages/Bots.tsx`): pedía `limit=200` al listar tenants, pero el backend (`GET /api/admin/tenants`) rechaza `limit>100` (422 Unprocessable Content), dejando el desplegable vacío
- Aislamiento de datos por agente en RAG (ChromaDB): cada documento ahora pertenece a un único bot_id, tanto en la ingesta como en la búsqueda/listado/borrado (antes la knowledge base era global y compartida entre todos los agentes)
- El entrenamiento configurado por agente (system_prompt/ius_config) ahora se aplica también en WhatsApp y Telegram (antes solo se usaba en el canal Web; los demás canales respondían con un prompt genérico igual para todos los agentes)
- Los endpoints de documentos (`/api/documents/*`, `/api/rag/*`) ahora requieren autenticación y ownership del bot; varios de ellos no requerían login en absoluto
- Service Worker de `frontend-tenant` (`public/sw.js`) cacheaba `tenant-config.js` con estrategia cache-first pese a que nginx lo sirve con `Cache-Control: no-store` — si un navegador lo pedía antes de que `TENANT_ID_<SLUG>` quedara bien seteado, quedaba pegado a esa respuesta vacía para siempre ("este contenedor no tiene un tenant configurado") aunque el servidor ya sirviera la config correcta. Ahora se excluye de la caché del SW y se bumpeó `CACHE_NAME` para invalidar las entradas ya guardadas
- Login OAuth con Google (panel y landing, ADR-012): el `sessionToken` que el backend creaba contra el Nango interno (`nango-server:8080`) no validaba en la instancia pública (`api.nango.intellify.pro`), así que el Connect UI moría con **401** en `wss://api.nango.intellify.pro/`. Al apuntar `NANGO_HOST` (`.env.prod`) a la URL pública, el backend crea la sesión sobre la misma instancia que consume el browser y el flujo funciona.

### Eliminado
- `/api/documents/*` y `/api/rag/*` (globales, sin bot_id) → reemplazados por `/api/bots/{bot_id}/documents/*`
- `POST /api/chat` y `POST`/`GET /api/webhook` (WhatsApp legacy) deprecados (410 Gone)
- Campo vestigial `Bot.knowledge_base_id` (nunca se llegó a usar)

---

## Formato

```
## [x.y.z] - YYYY-MM-DD

### Agregado
- Nuevas features

### Cambiado
- Cambios en features existentes

### Corregido
- Bug fixes

### Eliminado
- Features o endpoints removidos

### Breaking Changes
- Cambios que rompen compatibilidad
```
