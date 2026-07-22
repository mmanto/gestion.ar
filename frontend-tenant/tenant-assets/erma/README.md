Assets nativos para el APK Android del tenant `erma`.

Antes de poder correr `./stack.prod build-android erma ...` (o
`./stack.dev build-android erma ...`) hace falta:

1. Completar en `.env.prod` (y `.env.dev` si vas a compilar en local):
   ```
   TENANT_APPID_ERMA=erma.intellify.pro       # o el paquete que corresponda
   TENANT_APPNAME_ERMA=erma Staff             # nombre visible del ícono
   TENANT_BRANDCOLOR_ERMA=#000000             # color de marca (splash/status bar)
   ```
2. (Opcional, recomendado) Colocar acá `logo.png` — un logo cuadrado de al
   menos 1024×1024, fondo transparente o sólido. `build-android` lo usa con
   `@capacitor/assets` para regenerar automáticamente el ícono de lanzador y
   el splash screen en todas las densidades de Android. Sin este archivo, el
   build sigue funcionando pero usa el ícono/splash de `ius` ya committeado
   (con un warning en la salida).

   Nota: `@capacitor/assets` depende de `sharp` (procesamiento de imágenes
   nativo). Si `npm install` bloqueó su script de instalación en esta
   máquina, corré una vez `npm install-scripts approve sharp` en
   `frontend-tenant/` antes de generar íconos por primera vez.
3. (Opcional) Colocar acá `google-services.json`, descargado desde el
   proyecto de Firebase creado para `erma` (Project Settings → General →
   tu app Android, con el mismo `applicationId` que `TENANT_APPID_ERMA`).
   Sin este archivo, el APK compila igual pero sin push notifications para
   este tenant.
