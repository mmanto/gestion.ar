import type { CapacitorConfig } from '@capacitor/cli';

// App nativa dedicada al staff del tenant ius (ver docs/dev/DECISIONS.md ADR-007
// y el plan en /home/mmanto/.claude/plans/ para el contexto de por qué es una
// app propia y no multi-tenant). Un solo target, sin fork de build — el mismo
// `dist/` que genera `npm run build` (web) se empaqueta tal cual acá.
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

// Navy de la marca ius (ver frontend-tenant/public/img/logo_horizontal_ius.svg,
// fill #25357a) — mismo color para splash y status bar.
const IUS_NAVY = '#25357a';

const config: CapacitorConfig = {
  appId: 'ius.intellify.pro',
  appName: 'ius Staff',
  webDir: 'dist',
  server: isCleartextBuild ? { cleartext: true, androidScheme: 'http' } : undefined,
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: IUS_NAVY,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Fondo oscuro (navy) -> iconos/texto claros
      style: 'DARK',
      backgroundColor: IUS_NAVY,
    },
  },
};

export default config;
