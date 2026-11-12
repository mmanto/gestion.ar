import { useEffect } from 'react';
import { getInternalTenantSlug } from '../config/internalTenant';

/**
 * Hook que inyecta dinámicamente un manifest PWA específico al canal en el <head>.
 * Mientras el usuario está en el chat del cliente, el manifest apunta al bot
 * (con start_url correcto para instalación como app independiente).
 * Al desmontar, restaura el manifest original del admin.
 */
export function usePwaManifest(channelId: string | undefined) {
  useEffect(() => {
    if (!channelId) return;

    // En la URL interna del apex el chat vive bajo `/<slug>/chat/c/<id>`: el
    // prefijo viaja como `base_path` para que el manifest instalado abra ahí.
    const slug = getInternalTenantSlug();
    const targetHref = `/api/public/channels/${channelId}/manifest.webmanifest`
      + (slug ? `?base_path=${encodeURIComponent(`/${slug}`)}` : '');
    const link = document.getElementById('app-manifest') as HTMLLinkElement | null
      ?? document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;

    // El script inline de index.html ya lo setea correctamente — no hacer nada
    if (link?.href?.includes(channelId)) return;

    const originalHref = link?.href ?? '/manifest.webmanifest';

    if (link) {
      link.href = targetHref;
    }

    return () => {
      if (link) link.href = originalHref;
    };
  }, [channelId]);
}
