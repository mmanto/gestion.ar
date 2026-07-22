Assets nativos para el APK Android del tenant `proptech`.

Antes de poder correr `./stack.prod build-android proptech ...` hace falta:

1. Completar en `.env.prod`:
   ```
   TENANT_APPID_PROPTECH=proptech.intellify.pro   # o el paquete que corresponda
   TENANT_APPNAME_PROPTECH=proptech Staff         # nombre visible del ícono
   TENANT_BRANDCOLOR_PROPTECH=#000000             # color de marca (splash/status bar)
   ```
2. (Opcional, recomendado) Colocar acá `logo.png` — un logo cuadrado de al
   menos 1024×1024, fondo transparente o sólido (podés partir del logo ya
   existente en `sites/proptech-landing/`). `build-android` lo usa con
   `@capacitor/assets` para regenerar automáticamente el ícono de lanzador y
   el splash screen en todas las densidades de Android. Sin este archivo, el
   build sigue funcionando pero usa el ícono/splash de `ius` ya committeado
   (con un warning en la salida).

   Nota: `@capacitor/assets` depende de `sharp` (procesamiento de imágenes
   nativo). Si `npm install` bloqueó su script de instalación en esta
   máquina, corré una vez `npm install-scripts approve sharp` en
   `frontend-tenant/` antes de generar íconos por primera vez.
3. (Opcional) Colocar acá `google-services.json`, descargado desde el
   proyecto de Firebase creado para `proptech` (Project Settings → General
   → tu app Android, con el mismo `applicationId` que
   `TENANT_APPID_PROPTECH`). Sin este archivo, el APK compila igual pero sin
   push notifications para este tenant.
