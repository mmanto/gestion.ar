# CHANGELOG.md

Historial de cambios del proyecto. Seguir el formato [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Sin versión] - En desarrollo

### Cambiado
- **Login/registro con Google: pantalla intermedia de carga en vez de
  quedarse en el formulario.** Tras autenticar en el Chrome Custom Tab y
  volver a la app, en conexiones lentas el usuario veía el login con el botón
  "Conectando…" y podía re-tocar el botón, reiniciando el flujo. Ahora durante
  el OAuth se reemplaza el formulario por una pantalla de carga (spinner +
  "Autenticando con Google…") sin controles interactivos, y se agregó un guard
  anti-reintento (`oauthInFlight`) para que un segundo clic nunca arranque un
  flujo concurrente (los botones de Google ya quedaban deshabilitados;
  la pantalla intermedia los elimina por completo). Aplica a `LoginForm` y
  `RegisterForm`. **Requiere reinstall del APK.**
- **La app nativa Android del tenant ius se llama "ius" (antes "ius Staff").**
  `TENANT_APPNAME_IUS` (`.env.prod`/`.env.example`), el default de
  `frontend-tenant/capacitor.config.ts` y el `app_name`/`title_activity_main`
  del snapshot Android se alinearon al nombre corto — `build-android` lo
  patchea automáticamente desde `TENANT_APPNAME_IUS`. **Requiere reinstall del
  APK** (`frontend-tenant/dist-apk/gestionar-ius-debug.apk`).
- **Landing de pachoteayuda con el diseño dedicado de "César Pacho ·
  Asistente Ciudadano de Bolívar".** `sites/ipachoteayuda-landing/index.html`
  pasó del template genérico (Tailwind, paleta sun) al diseño propio del
  cliente: paleta violeta (`#130a21`/`#441e7d`), tipografías Montserrat +
  JetBrains Mono, header centrado con el logo, hero de dos columnas con foto
  y CTA **"Empezar a chatear"**, y footer-banner con curva y logos de la
  Municipalidad de Bolívar. Se mantiene el **chat embebido del tenant**
  (`/chat-widget.js`, botón flotante + panel con el iframe del canal
  `channel_96ad03bc1a1d`, disparado también por `data-open-chat`), con el
  del FAB ajustado a la nueva paleta (`#130a21`). El chat **se abre
  automáticamente al cargar la página** (configurable: `__IPA_CHAT__ =
  { openOnLoad: false }` arranca cerrado). Meta title/description/
  OG actualizados a la marca nueva, canonical a `https://pachoteayuda.intellify.pro/`.
  **Requiere rebuild + redeploy de `landing-ipachoteayuda`.**
- **Escritorio de ERMA: del semáforo de leads al calendario de turnos.** El
  tenant ERMA quedó configurado con `branding.industry = 'salud'`, con lo que
  el Dashboard oculta los cards del semáforo (Viable/Potencial/Exploración) y
  muestra en su lugar el calendario de turnos del consultorio
  (`AppointmentsCalendar`), manteniendo la grilla de pacientes debajo; el menú
  pasa a "Pacientes"/"Historia Clínica". Se rediseñó el calendario con una
  paleta verde salvia/musgo armónica con la marca de ERMA (`#4a6741`): celdas
  de día redondeadas con hover suave, día seleccionado relleno en salvia,
  badge de conteo de turnos, cabecera de mes y detalle del día con barra de
  acento verde. En una segunda pasada el calendario quedó compacto (celdas
  bajas tipo Google) y el mes + los turnos del día seleccionado se muestran
  en la misma fila, dos columnas: izquierda el calendario, derecha el listado.
  **Requiere rebuild + redeploy de `frontend-tenant`** y aplicar
  `industry=salud` en los tenants ERMA (`docker compose exec app python
  scripts/apply_erma_branding.py`).

### Corregido
- **El diálogo de permisos de notificaciones se pedía en el instante en que
  terminaba el login con Google, cortando el flujo en algunos equipos.**
  `useNativeStaffPush` lanzaba `PushNotifications.requestPermissions()` apenas
  `isAuthenticated` pasaba a `true`, justo en la ventana de retorno del Chrome
  Custom Tab del OAuth — en algunos móviles el diálogo del sistema quedaba
  detrás / se perdía la respuesta y el usuario veía la app "colgada" sin entrar.
  Ahora el pedido se difiere hasta que la Activity está en foco
  (`@capacitor/app` `appStateChange`/`getState`) y tras un margen de
  asentamiento del dashboard, y es no-bloqueante (try/catch), así el prompt
  sale siempre en primer plano y nunca puede percibirse como un fallo del
  login. Nota: en Android el permiso `POST_NOTIFICATIONS` no se puede conceder
  automáticamente (API 33+, targetSdk 36) — la solución es el timing/foreground.
  **Requiere reinstall del APK**
  (`frontend-tenant/dist-apk/gestionar-ius-debug.apk`).
- **"Compartir enlace" / "Mi link de chat" en el APK Android apuntaban al
  dominio del API (`api.intellify.pro`) en vez del frontend del tenant
  (`ius.intellify.pro`).** En la app nativa (Capacitor) todas las llamadas
  van directo al backend (`VITE_API_URL`), así que `getPublicUrl()` derivaba
  el dominio público del Host de la request — el del API. `build-android`
  hornea `VITE_TENANT_PUBLIC_URL` desde `TENANT_PUBLIC_URL_<SLUG>` (`.env.prod`,
  ius ya seteado a `https://ius.intellify.pro`) y el frontend lo usa como base
  del link de chat cuando está presente, cayendo a la derivación por Host solo
  en web. **Causa raíz del deploy previo:** `stack-prod.sh`/`stack-dev.sh`
  leían la variable con el nombre mal (`PUBLICURL`, `TENANT_PUBLICURL_<SLUG>`)
  en vez de `PUBLIC_URL` (`TENANT_PUBLIC_URL_<SLUG>`), así que horneaban una
  URL vacía y el fix no surtía efecto. Corregido en ambos scripts y APK de ius
  regenerado con la URL horneada. **Requiere reinstall del APK**
  (`frontend-tenant/dist-apk/gestionar-ius-debug.apk`).
- **Tenant local de ERMA apuntaba a un tenant inexistente:** en
  `docker-compose.tenants.local.yml` y en el dev-server de
  `docker-compose.tenants.dev.yml`, `TENANT_ID=tenant_bf351fa15c7d` no existía
  en la base local — el SPA no resolvía el tenant. Se corrigió a
  `tenant_4d47f2900969` (ERMA local, `erma.com.test`).
- **Hosts nuevos de `*.intellify.pro` no obtenían certificado — y cuando se
  tocó el Traefik, se cayeron TODOS los hosts:** dos causas encadenadas.
  (1) El certresolver del Traefik embebido (`docker-compose.yml`, container
  `gestionar_traefik`) usaba HTTP-01 en `entrypoints.web`: con el redirect
  global HTTP→HTTPS, el challenge de Let's Encrypt seguía a `https://` (sin
  cert aún) y moría con `tls: internal error`, impidiendo la primera emisión
  de cualquier host nuevo (p.ej. `pachoteayuda.intellify.pro`: "no puede
  otorgar una conexión segura"). Se cambió a **TLS-ALPN-01**
  (`acme.tlschallenge=true`), que negocia el challenge a nivel TLS en `:443`
  sin pasar por el redirect. (2) En paralelo, el store ACME se montaba con
  `./acme.json:/acme.json`: como ese archivo no existe en el repo, Docker
  creó un **directorio** en su lugar → el resolver `letsencrypt` quedaba
  skiped ("permissions 755 ... are too open", el volume se montaba en
  `:/acme.json` — path inexistente → Docker crea ahí un **directorio**) →
  TODOS los routers con `certresolver=letsencrypt` reportaban "nonexistent
  certificate resolver" y **ningún** host emitía ni servía cert. Se reemplazó
  por montar el **volumen nombrado `traefik_acme_data` en un directorio**
  (`traefik_acme_data:/acme`) con el store como archivo dentro
  (`--certificatesresolvers.letsencrypt.acme.storage=/acme/acme.json`).
  **Requiere** en el server:
  `git pull && docker compose --profile traefik up -d --force-recreate traefik`
  (los certs previos se re-emiten solos al primer tráfico; ver
  `docs/ops/RUNBOOK.md`).

### Agregado
- **Nuevo tenant `ipachoteayuda` con dominio propio de subdominio
  `pachoteayuda.intellify.pro` y su landing.** Alta del tenant (id
  `tenant_9ef2a8bdd6b7`, status `active`, Plan Básico), su usuario admin
  (`ipachoteayuda_admin`), el bot `ipachoteayuda` (business_type `asistencia`)
  y su canal web vía
  `backend/scripts/create_ipachoteayuda_tenant.py` — el canal es el que
  embeber la landing en `/chat/c/<channel_id>`. (Nota: el canal activo en
  prod — verificado el 2026-08-16 — es `channel_96ad03bc1a1d`, bot
  `bot_7b69446dceb98` "Muni bolivar AG"; el id originalmente documentado
  `channel_1d2fc630d688` no existía en la DB.) Landing estática en
  `sites/ipachoteayuda-landing/` (`index.html` + `chat-widget.js` +
  `nginx.conf` + `Dockerfile`, estilo laboralia/erma) con botón/chat flotante
  del tenant. Service blocks `frontend-tenant-ipachoteayuda` +
  `landing-ipachoteayuda` en `docker-compose.tenants.local.yml`, `.dev.yml` y
  `.tenants.prod.yml` (Traefik `Host(\`pachoteayuda.intellify.pro\`)`, igual
  que ius/laboralia/proptech — subdominio cubierto por el wildcard
  `*.intellify.pro`) y la variable `TENANT_ID_IPACHOTESAYUDA` en
  `.env.example`/`.env.prod`/`ENV.md`. **Requiere**: en prod,
  `up -d --build frontend-tenant-ipachoteayuda landing-ipachoteayuda` con el
  stack de tenants (ver `docs/ops/DEPLOYMENT.md`).
- **Edición y eliminación de tenants en el panel admin.** La página de
  detalle del tenant (`/admin/tenants/:tenantId`) ahora permite editar el
  **nombre y dominio propio** (además de estado, plan y marca) y eliminar el
  tenant desde una zona de peligro. En backend, `DELETE
  /api/admin/tenants/{tenant_id}` rechaza (409) si el tenant tiene bots,
  usuarios, canales, clientes o conversaciones — nunca borra en cascada datos
  de negocio (mismo criterio que `delete_plan`/`delete_user`).
- **Nuevo tenant `pachoteayuda` con dominio propio `pachoteayuda.ar`.** Alta
  del tenant (id `tenant_7099f777c4d8`, status `active`, Plan Básico) y su
  usuario admin (`pachoteayuda_admin`) vía
  `backend/scripts/create_pachoteayuda_tenant.py`; service block
  `frontend-tenant-pachoteayuda` en `docker-compose.tenants.local.yml`,
  `.dev.yml` y `.tenants.prod.yml` (Traefik `Host(\`pachoteayuda.ar\`)`) y la
  variable `TENANT_ID_PACHOTESAYUDA` en `.env.example`/`.env.prod`/`ENV.md`.
  **Requiere**: en prod, apuntar el DNS A/CNAME de `pachoteayuda.ar` a este
  servidor y `up -d --build frontend-tenant-pachoteayuda` con el stack de
  tenants (ver `docs/ops/DEPLOYMENT.md`).
- **Chat en blanco por carga de página para alta de pacientes/ciudadanos**
  (`BotConfig.blank_chat_on_load`): los bots configurados con `true` (ERMA, y
  pachoteayuda cuando exista) arrancan cada visita del chat con identidad de
  sesión nueva — no se reutiliza el `device_id` persistido, la conversación
  empieza en blanco y el flujo vuelve a pedir nombre/DNI/WhatsApp, quedando
  un alta nueva de paciente/ciudadano en el backoffice. El flag se expone en
  `GET /api/public/channels/{id}` (`bot.blank_chat_on_load`) y el frontend
  (`ChatPage`/`useWebSocketChat`) lo aplica generando una identidad nueva por
  carga de página (estable entre reconexiones). Sin el flag, el chat conserva
  la sesión del dispositivo y el historial como hasta ahora.

### Corregido
- **Registro por Google en la landing de iUS** (`sites/ius-landing/registro.html`):
  el botón "Registrarme con Google" de la landing mostraba un `alert()` demo
  hardcodeado ("Conecta este botón a tu proveedor de Google OAuth. (demo)") en
  vez de hacer el OAuth real. Se restauró el wiring del micro-frontend de
  registro (el bundle `register-embed.js`, que ya existía y el router servía):
  el form estático se reemplazó por `#register-root` y ahora monta el
  `RegisterForm` real, que dispara el flujo OAuth de Google (relacionado con el
  Diagnóstico de Nango). También se agregó `/register-embed.js` a la regla del
  router `landing-ius` local (en prod ya estaba). El SPA `/register` del tenant
  ya funcionaba — este bug era solo de la landing estática.

- **El chat público ya no pide iniciar sesión** (`frontend-tenant/src/services/api.ts`):
  el interceptor de axios redirigía a `/login` ante **cualquier** respuesta 401,
  sin distinguir ruta pública de protegida. Como el chat del cliente del mismo
  origen comparte `localStorage` con el backoffice, si quedaba un token vencido
  del staff, `AuthProvider.checkAuth()` recibía 401 al validarlo y el embed del
  chat de la landing saltaba al login. Ahora la limpieza del token ocurre siem-
  pre, pero el redirect a `/login` solo se dispara en rutas protegidas del
  backoffice; las públicas (`/`, `/login`, `/register`, `/registro`, `/chat/*`,
  `/u/*`) se quedan en su página. El redirect de backoffice sigue intacto.

### Agregado

- **Registro de turnos ERMA: garantía de datos del paciente** (`docs/turnos.json`,
  `docs/erma_ius_config.json`): el flujo de reserva (`iniciar_reserva_turno`)
  pide y valida los tres datos obligatorios — apellido y nombre completo, DNI
  y WhatsApp — antes de mostrar el calendario; no se confirma ningún turno sin
  ellos. Se corrigieron los keys de `turnos.json` (antes `name`/`phone`, que el
  booking service no vuelca al Client del backoffice) a los well-known
  (`nombre`/`dni`/`whatsapp`), y el system prompt de ERMA ahora instruye al
  agente a no confirmar ni saltear esos datos, y cómo manejar a quien no los
  quiera dar.

- **Scroll nativo en la landing de ERMA** (`sites/erma/scroll-fix.js`): el
  bundle de la landing inicializa Lenis (smooth-scroll) con easing largo — el
  wheel casi no desplazaba la página (un giro de 400px movía ~55px; ticks
  seguidos, 0px) y el HTML quedaba con `class="lenis lenis-smooth"`. Como la
  instancia de Lenis no queda expuesta en `window` (no se puede `.stop()`),
  este script la neutraliza desde afuera: quita la clase `lenis-smooth` del
  `<html>` y bloquea en fase de captura el listener de `wheel` de Lenis **sin**
  `preventDefault` → el navegador hace scroll nativo, fluido y 1:1 con la
  rueda. Servido por la landing con `expires -1` y listado en la regla Path de
  `landing-erma` (prod y local).
- **Chat embebido en la landing de ERMA** (`sites/erma/chat-widget.js`): botón
  flotante verde (marca de la landing) que abre un panel con el chat del tenant
  en un iframe (`/chat/c/channel_3728c7f54d80`, mismo origen). Script vanilla
  inyectado desde `index.html` (la landing es un build sin fuente); se sirve
  por la landing con `expires -1` y está listado en la regla Path de
  `landing-erma` (prod y local). Al cerrar el panel se descarga el iframe
  (`about:blank`) para cortar WS/push en background.
- **Landing estática de ERMA en el stack** (`sites/erma/` → contenedor
  `landing-erma`): comparte el dominio `erma.com.ar` con `frontend-tenant-erma`
  igual que ius/laboralia/proptech — el router de Traefik matchea `/`, `.html`,
  el bundle (`/assets/bundle.js`) e imágenes de la landing; cualquier otra ruta
  (`/login`, `/dashboard`, `/api/*`…) cae en la app del tenant. Se agregó el
  servicio a `docker-compose.tenants.prod.yml` y `.local.yml`, y `erma-landing`
  a `SITES` en `stack-dev.sh`/`stack-prod.sh`. **Requiere deploy** (el DNS de
  `erma.com.ar` debe apuntar al VPS para que el login del tenant responda en
  `/login` — ver `docs/ops/INFRASTRUCTURE.md`).

### Agregado
- **Pantalla de carga en la landing de ERMA** (`sites/erma/index.html`):
  un overlay con spinner + marca cubre el sitio y se oculta recién cuando
  `window.load` dispara (el bundle es `defer`, así que a ese punto el root ya
  está renderizado), con un safety timeout de 12s por si algún recurso cuelga
  el load. La landing solo se muestra estando completamente cargada.

### Cambiado
- **Chat de ERMA arranca abierto + foco en el input:** en `chat-widget.js` el
  panel ya no espera el click del FAB — se abre por defecto apenas carga la
  landing (el FAB queda oculto y reaparece si se cierra con la X). Y el
  `ChatInputBar` del SPA enfoca el textarea en cuanto el chat queda conectado
  (mientras no conecta viene `disabled` y no recibe foco), para que el prompt
  esté listo para escribir.
- **Barra superior del chat web (`/chat/c/:channelId`) marcada con el branding
  del tenant:** el `ChatHeader` del SPA dejó de estar hardcodeado en índigo con
  logo de ius y ahora se pinta con el `primary_color` del tenant, muestra su
  logo (`logo_url_vertical`/`logo_url`) y su nombre vía `useTenant()` —
  cada tenant define su color/logo desde Ajustes > Marca y se refleja en su
  chat. En la landing de ERMA, se quitó la cabecera verde duplicada que
  agregaba `chat-widget.js` (que además llevaba la X de cierre reubicada como
  overlay sobre la barra del chat): ahora queda una sola barra, la del chat,
  ya marcada con el color e imagen del negocio. **Requiere rebuild + redeploy**
  de `frontend-tenant` y `landing-erma`.
- **Menú mobile (app Android y web < `md`):** por definición de producto, el
  menú del avatar ahora solo muestra **Escritorio, Ajustes y Salir** (se quitó
  la navegación lateral completa del menú mobile). En desktop la sidebar sigue
  siendo el menú de aplicación completo. Se agrega además el ítem **Compartir**
  (sección "Mi cuenta") que abre la pantalla `/compartir`: input de número de
  WhatsApp + botón que envía un mensaje con los datos del staff (nombre,
  correo) y su link de chat web propio (`/chat/c/{channel_id}`).

### Cambiado
- **Navegación mobile del dashboard (app Android y web < `md`):** el menú de la
  aplicación ya no se abre por hamburguesa/drawer lateral — la sidebar es solo
  desktop y, en mobile, el **menú del avatar es el menú de la aplicación**
  (lleva los links de navegación del panel). Se quitaron el drawer mobile del
  template default y del template kero. En Ajustes también se eliminó la
  opción "Mostrar la barra lateral de navegación" (el campo `sidebar_visible`
  del branding queda en el modelo, sin control en la UI).

### Corregido
- **App Android — el login con huella fallaba con "PROMPT_ERROR" en el primer
  intento (el segundo funcionaba):** los métodos de plugin de Capacitor 8 se
  ejecutan en un `HandlerThread` propio ("CapacitorPlugins"), y
  `BiometricPrompt.authenticate()` exige el main thread (el FragmentManager de
  androidx lanza `IllegalStateException: Must be called from main thread of
  fragment host` al añadir el diálogo). Ahora el plugin ejecuta el prompt en el
  main thread y recién cuando la activity está `RESUMED`, tanto en login como en
  el enrolamiento. Además se normalizaron los errores del plugin en
  `biometric.service.ts`: antes el UI mostraba el código crudo ("PROMPT_ERROR",
  "NEED_REENROLL", números…). Requiere rebuild + reinstall del APK.

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
- **App Android — la sección "Acceso con huella" reportaba "sin huella
  configurada" aunque el dispositivo sí tiene una:** el plugin nativo
  `BiometricAuth` (que envuelve el `BiometricPrompt` + Keystore) no se
  autoregistraba ante Capacitor en builds multidex — la clase quedaba en
  `classes11.dex` y Capacitor descubre plugins de la app escaneando el dex
  primario, así que `isAvailable()` tiraba "plugin not registered" en el
  puente (atrapado en silencio: sin `reason` ni log nativo). Fix: registro
  explícito con `registerPlugin(BiometricAuthPlugin.class)` en
  `MainActivity.onCreate` antes de crear el bridge. Requiere rebuild +
  reinstall del APK.
- **App Android — el login pasó a mostrar el front de ADMIN (sin huella ni
  login social):** los `assets/` de `frontend-tenant/android/` estaban
  commitados con un bundle stale del panel admin (`index.html` → `index-sS5bLEIw.js`),
  así que un `assembleDebug` directo empaquetaba ese bundle (login sin "Entrá
  con tu huella" y Google deshabilitado) y el service worker en
  `https://localhost` servía además la caché vieja del admin. Fix: `npx cap
  sync android` restauró el bundle del tenant (index.html → `index-xbj8IGzg.js`),
  se limpió el service worker y se reinstaló. Nota: los `assets/` corregidos
  deben quedar commitados para que no reaparezca.
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
