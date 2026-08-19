import type { CapacitorConfig } from '@capacitor/cli';

// App nativa por tenant (build-android en scripts/stack-*.sh selecciona
// cuál). appId/appName/color de marca se leen de VITE_TENANT_APPID /
// VITE_TENANT_APPNAME / VITE_TENANT_BRANDCOLOR (seteadas por el build
// script desde TENANT_APPID_<SLUG>/etc. en .env.prod/.env.dev), con los
// valores de ius como default para no romper un `npm run build:capacitor`
// corrido a mano sin esas env vars.
// cleartext + androidScheme:'http' solo para builds contra un backend de
// desarrollo en http:// (ej. http://10.0.2.2:8000 desde el emulador). Los
// builds de prod apuntan a un dominio https:// real y no lo necesitan.
// Nota: `cleartext` solo habilita cleartext a nivel de política de red de
// Android — la WebView sigue sirviendo la app bajo un origen fijo (por
// default https://localhost), y su política de Mixed Content bloquea
// igual cualquier request http:// sin importar `cleartext`. Por eso además
// hay que bajar `androidScheme` a 'http' para que el origen de la propia
// app deje de ser https y coincida con el esquema del backend de dev.
const isCleartextBuild = (process.env.VITE_API_URL || '').startsWith('http://');

const appId = process.env.VITE_TENANT_APPID || 'ius.intellify.pro';
const appName = process.env.VITE_TENANT_APPNAME || 'ius';
// Color de marca del tenant (splash + status bar) — default navy de ius
// (ver frontend-tenant/public/img/logo_horizontal_ius.svg, fill #25357a).
const brandColor = process.env.VITE_TENANT_BRANDCOLOR || '#25357a';

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: 'dist',
  server: isCleartextBuild ? { cleartext: true, androidScheme: 'http' } : undefined,
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: brandColor,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Fondo oscuro (navy) -> iconos/texto claros
      style: 'DARK',
      backgroundColor: brandColor,
    },
  },
};

export default config;
