import { createRoot } from 'react-dom/client';
import { RegisterForm } from '../components/auth/RegisterForm';
import authService from '../services/auth.service';
import { signupWithPasskey } from '../services/passkey.service';

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

/**
 * Guarda la sesión de un alta que ya autenticó. El embed no tiene AuthContext
 * (ni router), así que el guardado es manual — mismo camino para Google y para
 * la passkey.
 */
async function applySession(appToken: string) {
  await authService.saveToken(appToken);
  await authService.saveUser(await authService.verifyToken());
}

if (mount) {
  createRoot(mount).render(
    <RegisterForm
      tenantId={tenantId}
      branding={branding}
      initialPlan={initialPlan}
      submit={async (payload) => (await authService.register(payload)).payment?.url ?? null}
      google={async (t, plan) => {
        const { token } = await authService.loginWithProvider('google', t, plan);
        await applySession(token);
      }}
      passkey={async (t, plan, nombre) => {
        // Alta con passkey (misma cuenta sin correo que el alta con Google).
        const { token } = await signupWithPasskey(t, { nombre, plan });
        await applySession(token);
      }}
    />
  );
}
