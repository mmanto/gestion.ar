# CHANGELOG.md

Historial de cambios del proyecto. Seguir el formato [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Sin versión] - En desarrollo

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
