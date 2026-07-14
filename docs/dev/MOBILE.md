# MOBILE.md — Desarrollo Mobile (ADR-007)

Pendientes y próximos pasos para las apps nativas con Capacitor.
Ver ADR-007 en `DECISIONS.md` para el contexto arquitectónico.

---

## Setup de plataformas nativas

### Android

```bash
cd frontend-tenant
npm run build:staff          # o build:client
VITE_TARGET=staff npx cap sync
cd android && ./gradlew assembleDebug
```

**Requisitos:**
- Android SDK (Android Studio o `sdkmanager`)
- `ANDROID_HOME` o `ANDROID_SDK_ROOT` en el path
- Java 17+ (JDK)

El proyecto `android/` ya está generado con 7 plugins de Capacitor.

### iOS

```bash
cd frontend-tenant
npm run build:staff
VITE_TARGET=staff npx cap add ios
npx cap open ios
```

**Requisitos:**
- macOS con Xcode 15+
- Apple Developer account (para firmar y distribuir)

---

## Push notifications nativas

### FCM (Android)

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Project Settings → Service Accounts → Generate new private key
3. Guardar el JSON en el servidor (ej. `/opt/secrets/firebase-credentials.json`)
4. Agregar a `.env.prod`:

```bash
FCM_CREDENTIALS_PATH=/opt/secrets/firebase-credentials.json
```

5. Agregar el archivo `google-services.json` a `frontend-tenant/android/app/`

### APNs (iOS)

1. En [Apple Developer](https://developer.apple.com/account/) → Keys → crear APNs Auth Key
2. Descargar el archivo `.p8`
3. Agregar a `.env.prod`:

```bash
APNS_KEY_PATH=/opt/secrets/apns-key.p8
APNS_KEY_ID=ABC1234567
APNS_TEAM_ID=DEF7890123
APNS_TOPIC=ar.gestion.staff     # bundle ID de la app
APNS_USE_SANDBOX=true           # true para desarrollo, false para producción
```

---

## Broadcast WhatsApp/Telegram → staff

El staff WebSocket (`/ws/staff/chat/{bot_id}`) solo recibe mensajes en tiempo real
del canal Web. Los webhooks de WhatsApp y Telegram no notifican al staff.

**Archivos a modificar:**

- `backend/app/routers/whatsapp_webhook_router.py`
- `backend/app/routers/telegram_webhook_router.py`

**Patrón a replicar** (ver `backend/app/routers/web_chat_router.py:_notify_staff`):

```python
from app.connection_manager import staff_connection_manager
from datetime import datetime, timezone

await staff_connection_manager.broadcast_to_bot(
    bot_id,
    {
        "type": "client_message",
        "conversation_id": conversation_id,
        "client_id": client_id,
        "client_name": client_name,
        "channel": "whatsapp",  # o "telegram"
        "content": user_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    },
)
```

Insertar después de cada `log_chat_interaction()` en ambos routers.

---

## botId dinámico en StaffAppProvider

`StaffAppProvider` recibe `botId={null}` (ver `frontend-tenant/src/App.tsx`).
El push nativo no se registra hasta que haya un `botId` válido.

**Fix pendiente:** cuando el Dashboard cargue los bots del tenant, pasar el primer
`bot_id` activo al provider. Opciones:

1. Usar un contexto `BotContext` que el Dashboard popule y `StaffAppProvider` consuma
2. Hacer que `useNativePushNotifications` acepte `botId` reactivo (ya lo hace — solo
   hay que pasarle el valor cuando esté disponible)

---

## Distribución en stores

### Play Store

1. Generar APK/AAB firmado: `./gradlew bundleRelease`
2. Crear listing en [Google Play Console](https://play.google.com/console)
3. Subir el AAB, screenshots, descripción, política de privacidad

### App Store

1. Crear App ID en [App Store Connect](https://appstoreconnect.apple.com)
2. Archivar y distribuir desde Xcode
3. Completar metadata, screenshots, privacy policy

---

## Variables de entorno nuevas

Ver `ENV.md` para la lista completa. Resumen de las agregadas por ADR-007:

| Variable | Descripción |
|---|---|
| `FCM_CREDENTIALS_PATH` | Path al JSON de Firebase Admin SDK |
| `APNS_KEY_PATH` | Path al .p8 de APNs |
| `APNS_KEY_ID` | Key ID de Apple |
| `APNS_TEAM_ID` | Team ID de Apple |
| `APNS_TOPIC` | Bundle ID de la app |
| `APNS_USE_SANDBOX` | `true` para desarrollo |

---

## Known issues

### Dependencia Firebase Admin bloquea build del backend

`firebase-admin==6.17.0` (requerido por ADR-007 para FCM push notifications)
requiere compilar `grpcio` y `google-api-core` con dependencias de sistema
(`libffi`, `openssl`, `rustc`/`cargo` para `cryptography`). En entornos sin
toolchain de compilación completo (Docker slim, VPS mínima), `pip install`
falla con errores de compilación de módulos C.

**Workaround actual:** quitar `firebase-admin` y `apns2` de `requirements.txt`
mientras no se esté desarrollando push notifications nativas. Re-agregarlas
cuando se implemente FCM/APNs (ver sección "Push notifications nativas").

**Fix definitivo (pendiente):**
- Agregar `build-essential`/`libffi-dev`/`libssl-dev` al Dockerfile del backend
- O usar imágenes base `python:3.11-slim-bookworm` con build deps preinstaladas
- Evaluar `firebase-admin` en modo lightweight sin `grpcio` (REST API en vez de gRPC)
