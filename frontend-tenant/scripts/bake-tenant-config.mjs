// Genera dist/tenant-config.js en tiempo de build para los builds nativos
// (Capacitor). En la web el tenant se resuelve por Host (GET
// /api/public/tenants/current) y nginx sirve un /tenant-config.js vacío; la
// app nativa no tiene Host, así que hornea el tenantId acá (window.__TENANT_CONFIG__,
// leído por TenantContext.tsx como primera fuente). El campo statsTwoColsMobile
// ya no lo consume TenantContext: se resuelve desde tenants.settings (DB).
//
// Importante: escribe solo en dist/ (output del build), nunca en public/ —
// si tocara public/ se filtraría a `npm run dev` y a los builds Docker de
// los demás tenants.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const tenantId = process.env.VITE_TENANT_ID;
if (!tenantId) {
  throw new Error('VITE_TENANT_ID no seteado — el build capacitor requiere un tenant fijo.');
}

const statsTwoCols = process.env.VITE_STATS_TWO_COLS_MOBILE === 'true';

const out = `window.__TENANT_CONFIG__ = { tenantId: ${JSON.stringify(tenantId)}, statsTwoColsMobile: ${statsTwoCols} };\n`;
const outPath = path.resolve('dist/tenant-config.js');
writeFileSync(outPath, out);
console.log(`[bake-tenant-config] tenant-config.js escrito para ${tenantId} (${outPath})`);
