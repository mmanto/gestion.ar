import { createRoot } from 'react-dom/client';
import { RegisterForm } from '../components/auth/RegisterForm';
import authService from '../services/auth.service';

/**
 * Entry del micro-frontend de autoregistro embebido en la landing estática
 * de ius (`sites/ius-landing/registro.html`). Compila a `register-embed.js`
 * (IIFE autocontenida, ver vite.embed.config.ts) y se monta en el div
 * `#register-root` que deja la landing.
 *
 * Reutiliza el mismo `RegisterForm` que la página `/registro` del panel y el
 * mismo servicio de red (`authService`) — la UI y el protocolo viven en un
 * solo lugar. La única diferencia con la SPA es que acá no hay router ni
 * contextos: el tenantId/la marca de ius se leen de `window.__IUS_REGISTER__`
 * (inyectado por el HTML de la landing) con defaults de ius.
 */
declare global {
  interface Window {
    __IUS_REGISTER__?: {
      tenantId?: string;
      branding?: { tenantName?: string; primaryColor?: string; logoUrl?: string | null };
    };
  }
}

const cfg = window.__IUS_REGISTER__ || {};
const tenantId = cfg.tenantId || 'tenant_17d505040583'; // ius (prod)
const branding = {
  tenantName: cfg.branding?.tenantName || 'iUS',
  primaryColor: cfg.branding?.primaryColor || '#25357a',
  logoUrl: cfg.branding?.logoUrl ?? null,
};
// La landing enlaza con ?plan=mensual|anual — se lo transfiere al form.
const requestPlan = new URLSearchParams(window.location.search).get('plan');
const initialPlan = requestPlan === 'anual' || requestPlan === 'mensual' ? requestPlan : null;

const mount = document.getElementById('register-root');
if (mount) {
  createRoot(mount).render(
    <RegisterForm
      tenantId={tenantId}
      branding={branding}
      initialPlan={initialPlan}
      submit={async (payload) => (await authService.register(payload)).payment.url}
      google={async (t, plan) => {
        // Mismo flujo que AuthContext.loginWithProvider (podría extraerse a
        // un helper compartido si se reutiliza en más lugares).
        const { token } = await authService.loginWithProvider('google', t, plan);
        await authService.saveToken(token);
        await authService.saveUser(await authService.verifyToken());
      }}
    />
  );
}
