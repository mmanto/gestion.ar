# MOBILE.md — App nativa Android del staff de ius (ADR-007)

Estado de la app nativa Android para el **staff** del tenant `ius` (legal),
empaquetada con Capacitor desde el mismo código de `frontend-tenant/` que
sirve el panel web — sin fork de build ni de componentes. Ver ADR-007 en
`DECISIONS.md` para el contexto arquitectónico (nota: ADR-007 describe la
idea original de dos targets `staff`/`client`; ese split se intentó, rompió
el sidebar del panel web para todos los tenants y se revirtió — lo que
describe este documento es la implementación real, de un solo target).

Para la **app del cliente final** (quien le escribe al bot, no el staff),
hay un plan de diseño separado — es un proyecto distinto, no forma parte de
esto.

---

## Arquitectura: un solo target, progressive enhancement

No existe `VITE_TARGET=staff|client` ni build condicional de rutas/layout.
`npm run build` (web) y `npm run build:capacitor` (nativo) generan el mismo
árbol de componentes; lo único que cambia es:

- **Tenant fijo horneado en build:** `scripts/bake-tenant-config.mjs` escribe
  `dist/tenant-config.js` con `window.__TENANT_CONFIG__` a partir de
  `VITE_TENANT_ID`, reusando el mismo mecanismo que `TenantContext.tsx` ya
  lee en la web (ahí lo inyecta `docker-entrypoint.sh` al arrancar el
  contenedor; acá se hornea en el bundle porque una app nativa no tiene ese
  arranque de contenedor).
- **Todo lo nativo es progressive enhancement** vía
  `Capacitor.isNativePlatform()`: back button, push nativo, secure storage,
  status bar/splash. Cero impacto en el build web — `isNativePlatform()`
  resuelve `false` ahí y esos hooks son no-op.

## Build

```bash
cd frontend-tenant
VITE_API_URL=http://10.0.2.2:8000/api VITE_TENANT_ID=tenant_6a10b2076443 \
  npm run build:capacitor       # tsc -b && vite build --mode capacitor && bake-tenant-config
npx cap sync android
cd android && ./gradlew assembleDebug
```

O, más simple, usando el comando del stack (valida requisitos, fija
`VITE_API_URL`/`VITE_TENANT_ID` según el entorno):

```bash
./stack.dev build-android emulator                          # http://10.0.2.2:8000/api
./stack.dev build-android device http://192.168.1.100:8000/api
./stack.prod build-android prod https://api.intellify.pro/api
```

`appId: ius.intellify.pro`, `appName: 'ius Staff'`
(`frontend-tenant/capacitor.config.ts`).

**Requisitos:** Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT`), JDK 17+.

`frontend-tenant/android/.gitignore` excluye `.gradle/`, `build/`,
`app/build/`, `google-services.json` y keystores — no volver a commitear
basura de build (ya pasó una vez, se limpió en `b976f40`/`b001d69`).

### iOS

No implementado todavía. El mismo patrón (capacitor.config, sin
`VITE_TARGET`) aplicaría con `npx cap add ios`, pero no hay `android/`
equivalente ni se probó.

---

## Push notifications nativas al staff

Cuando un cliente escribe por **Web, WhatsApp o Telegram**,
`notify_staff_of_client_message()` (`backend/app/connection_manager.py`) hace
dos cosas: WS en tiempo real (`staff_connection_manager`, para staff con la
app abierta) y `push_service.broadcast_to_staff()` (para staff en background
o con la app cerrada). Se llama desde `web_chat_router.py` (`_notify_staff`),
`whatsapp_webhook_router.py` y `telegram_handlers.py`.

`push_service.py` rutea por `platform` (`vapid`/`fcm`/`apns`) con
`_send_vapid`/`_send_fcm`/`_send_apns`.

### Registro del token (frontend)

`useNativeStaffPush.ts` (usado en `App.tsx`) registra el token nativo
(FCM en Android, APNs en iOS) contra el primer bot activo del tenant y lo
manda a `POST /api/pwa/subscribe-staff`. A diferencia de `POST /subscribe`
(público, para clientes anónimos), este endpoint requiere JWT y deriva
`user_id` siempre del token — nunca del body — para que nadie pueda
suscribirse con el `user_id` de otro miembro del staff.

### FCM (Android) — setup

**Local (ya hecho):** `backend/secrets/firebase-credentials.json`
(gitignored) + `FCM_CREDENTIALS_PATH=/app/secrets/firebase-credentials.json`
en `.env.dev` — funciona porque `docker-compose.override.yml` monta
`./backend:/app` entero.

**Prod (pendiente — requiere acceso SSH al servidor, ver
`docs/ops/DEPLOYMENT.md`):**

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com/)
   (ya existe: `ius-intellify`, mismo que
   `frontend-tenant/android/app/google-services.json`)
2. Project Settings → Service Accounts → Generate new private key
3. En el servidor: `ssh deploy@<IP_SERVIDOR>`, luego
   `mkdir -p /opt/secrets && chmod 700 /opt/secrets`
4. Subir el JSON generado a `/opt/secrets/firebase-credentials.json` (scp
   desde tu máquina — nunca pegarlo por SSH/nano en texto plano si se puede
   evitar)
5. `docker-compose.prod.yml` ya monta `/opt/secrets:/app/secrets:ro` en el
   servicio `app`, y `.env.prod` ya tiene
   `FCM_CREDENTIALS_PATH=/app/secrets/firebase-credentials.json` (ruta
   dentro del contenedor) — no hace falta tocar nada más de config
6. Redeploy: `cd /opt/app && ./deploy.sh` (o el `docker compose ... up -d
   --build app` manual de `DEPLOYMENT.md` si solo se cambió el mount, sin
   nuevo código)
7. Verificar (al arrancar el contenedor, en `PushService.__init__`):
   `docker compose ... logs app | grep -i fcm` debería mostrar `✅ Push
   Service (FCM) inicializado correctamente` en vez de `⚠️  Push Service:
   FCM_CREDENTIALS_PATH no configurado` (archivo ausente o ruta mal escrita
   en `.env.prod` — falla silenciosa, no tira error al arrancar) o `⚠️  Push
   Service: FCM init falló: ...` (JSON inválido/corrupto)

### Canal de notificación (Android) — obligatorio, no es opcional

Sin un canal propio declarado, FCM entrega los mensajes al
`fcm_fallback_notification_channel` que crea el SDK — en varios fabricantes
(confirmado en Motorola/MyUX con `adb logcat`, buscando
`NotificationListener: onNotificationPosted`) ese canal queda con prioridad
baja: la notificación se publica en el sistema (`✅ FCM enviado` en el
backend, `messaging.send()` no tira error) pero sin heads-up, sonido ni
vibración — llega, pero nadie la nota, y no hay ningún error en ningún lado
que lo delate. Se resuelve con tres piezas que tienen que ir juntas:

1. `AndroidManifest.xml`: meta-data
   `com.google.firebase.messaging.default_notification_channel_id` →
   `@string/default_notification_channel_id` (`strings.xml`, valor
   `ius_staff_messages`).
2. `MainActivity.java`: crea ese canal explícitamente con
   `NotificationManager.IMPORTANCE_HIGH` en `onCreate()` — si el canal no
   existe todavía cuando llega el primer mensaje, el SDK lo crea solo con
   importancia `DEFAULT`, que en algunos fabricantes tampoco alcanza para
   heads-up.
3. `push_service.py` (`_send_fcm`): el mensaje especifica
   `android.notification.channel_id="ius_staff_messages"` explícitamente,
   en vez de confiar en que el manifest resuelva el default.

**Para probar esto de nuevo:** cerrar la app deslizándola de recientes (no
`adb shell am force-stop` — eso pone la app en el estado "detenida" de
Android, que bloquea todo push hasta que se vuelve a abrir manualmente, y
da un falso negativo distinto al bug real: `GCM: broadcast intent callback:
result=CANCELLED`).

### APNs (iOS) — setup (sin implementar aún, ver arriba)

1. Apple Developer → Keys → crear APNs Auth Key, descargar el `.p8`
2. `.env.prod`:

```bash
APNS_KEY_PATH=/opt/secrets/apns-key.p8
APNS_KEY_ID=ABC1234567
APNS_TEAM_ID=DEF7890123
APNS_TOPIC=ius.intellify.pro
APNS_USE_SANDBOX=true           # true para desarrollo, false para producción
```

---

## JWT en Secure Storage

`tokenStorage.ts` (`frontend-tenant/src/services`) envuelve `localStorage`
en web y `capacitor-secure-storage-plugin` en nativo (Keychain/Keystore).
Usado desde `api.ts`/`auth.service.ts` en vez de `localStorage` directo —
en nativo el JWT nunca queda en el WebView storage inspeccionable.

---

## Chrome nativo

`@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/app`,
color navy de marca (`#25357a`, ver `capacitor.config.ts`). Back button
manejado por `useNativeBackButton.ts` (usado una vez en `App.tsx`, no-op en
web).

---

## Pendientes

- **Prueba funcional completa en dispositivo real** (login, navegación sin
  crashes, respuesta de conversación, push con la app completamente
  cerrada) — no se hizo todavía contra un teléfono físico de ius.
- **Firma de release + distribución:** hoy solo hay build debug. Falta
  keystore de upload (nunca commitear), `signingConfigs` en
  `android/app/build.gradle` vía variables de entorno, y decidir Play Store
  (probablemente alcanza con "internal testing", no es una app
  consumer-facing) vs. sideload directo de APKs a los dispositivos de ius.
- **iOS:** sin empezar.

---

## Variables de entorno

Ver `ENV.md` para la lista completa.

| Variable | Descripción |
|---|---|
| `FCM_CREDENTIALS_PATH` | Path al JSON de Firebase Admin SDK |
| `APNS_KEY_PATH` | Path al .p8 de APNs |
| `APNS_KEY_ID` | Key ID de Apple |
| `APNS_TEAM_ID` | Team ID de Apple |
| `APNS_TOPIC` | Bundle ID de la app (`ius.intellify.pro`) |
| `APNS_USE_SANDBOX` | `true` para desarrollo |
