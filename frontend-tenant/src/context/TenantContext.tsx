import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { TenantPublicInfo } from '../types/tenant.types';
import publicTenantService from '../services/publicTenant.service';
import { setTenantStorageScope } from '../services/tenantStorageScope';
import {
  ADMIN_PANEL_URL,
  INTERNAL_TENANT_HOST,
  getInternalTenantSlug,
  isInternalTenantHost,
} from '../config/internalTenant';

// Un único contenedor frontend-tenant sirve a todos los tenants y hay dos formas
// de resolver cuál es:
//   - URL interna: el primer segmento del path (`https://intellify.pro/<slug>/…`)
//     contra GET /api/public/tenants/by-slug/{slug}. En el apex todos comparten
//     Host, así que el Host no alcanza.
//   - dominios por Host (o alias de dev `<dominio>.localhost`): GET
//     /api/public/tenants/current, que matchea tenants.domain.
// En desarrollo local (sin dominio apuntando al backend) se fuerza con
// ?tenant=<id>, persistido en localStorage para no tener que repetirlo.
//
// Los builds nativos (Capacitor) no tienen Host: scripts/bake-tenant-config.mjs
// hornea el tenantId en el bundle como window.__TENANT_CONFIG__ y se lee acá
// como primera fuente. En la web nginx sirve /tenant-config.js con un objeto
// vacío (tenantId falsy), así que este chequeo sólo aplica en nativo.
declare global {
  interface Window {
    __TENANT_CONFIG__?: { tenantId: string; statsTwoColsMobile?: boolean };
  }
}

const DEV_TENANT_STORAGE_KEY = 'gestionar-tenant-dev-override';

/** No hay tenant en el path del apex (o el path es una ruta reservada). */
const NO_ORGANIZATION_ERROR = 'No encontramos esa organización.';

interface TenantContextType {
  tenantId: string | null;
  tenant: TenantPublicInfo | null;
  isLoading: boolean;
  error: string | null;
  statsTwoColsMobile: boolean;
  refetchTenant: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantPublicInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyTenant = useCallback((info: TenantPublicInfo) => {
    // Prefijo de la sesión en el storage: en el apex todos los tenants comparten
    // origen, así que el token no puede ser uno solo (ver tenantStorageScope).
    setTenantStorageScope(info.tenant_id);
    setTenant(info);
    setTenantId(info.tenant_id);
    document.title = info.name;
    setError(null);
  }, []);

  const resolveTenant = useCallback(async (): Promise<void> => {
    // 0) Build nativo (Capacitor): tenantId horneado en el bundle — no hay Host
    //    que matchee un dominio. En la web esto es un objeto vacío (tenantId
    //    falsy), así que se salta.
    const bakedTenantId = window.__TENANT_CONFIG__?.tenantId;
    if (bakedTenantId) {
      try {
        applyTenant(await publicTenantService.getTenantInfo(bakedTenantId));
        return;
      } catch {
        setError('No se pudo cargar la información del tenant.');
        return;
      }
    }

    // 1) URL interna del apex: el tenant es el primer segmento del path.
    const internalSlug = getInternalTenantSlug();
    if (internalSlug) {
      try {
        applyTenant(await publicTenantService.getTenantBySlug(internalSlug));
      } catch {
        setError(NO_ORGANIZATION_ERROR);
      }
      return;
    }

    // 2) Apex sin tenant en el path (`/`, `/login`, una ruta reservada): el apex
    //    es de la app, no del sitio de marketing. En producción se manda al panel
    //    de administración; en el alias de dev se deja el error visible para no
    //    sacar al dev-server de la pantalla que se está probando.
    if (isInternalTenantHost()) {
      setTenantStorageScope(null);
      if (window.location.hostname.toLowerCase() === INTERNAL_TENANT_HOST) {
        window.location.replace(`${ADMIN_PANEL_URL}/`);
        return;
      }
      setError(NO_ORGANIZATION_ERROR);
      return;
    }

    // 3) Resolución por dominio (prod: Host -> tenants.domain).
    try {
      applyTenant(await publicTenantService.getCurrentTenant());
      return;
    } catch {
      // 404 o error de red: el Host no es un tenant — caer al override de dev.
    }

    // 4) Fallback de desarrollo: ?tenant=<id> (persistido en localStorage).
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('tenant');
    if (fromQuery) {
      try {
        localStorage.setItem(DEV_TENANT_STORAGE_KEY, fromQuery);
      } catch {
        // ignorar si localStorage no está disponible
      }
      try {
        applyTenant(await publicTenantService.getTenantInfo(fromQuery));
        return;
      } catch {
        setError('No se pudo cargar la información del tenant.');
        return;
      }
    }

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DEV_TENANT_STORAGE_KEY);
    } catch {
      // ignorar si localStorage no está disponible
    }
    if (stored) {
      try {
        applyTenant(await publicTenantService.getTenantInfo(stored));
        return;
      } catch {
        setError('No se pudo cargar la información del tenant.');
        return;
      }
    }

    setError('No se pudo cargar la información del tenant.');
  }, [applyTenant]);

  useEffect(() => {
    resolveTenant().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetchTenant = useCallback(async () => {
    const internalSlug = getInternalTenantSlug();
    try {
      // Misma rama que `resolveTenant`: en el apex el tenant sale del path.
      if (internalSlug) {
        applyTenant(await publicTenantService.getTenantBySlug(internalSlug));
        return;
      }
      if (!tenantId) return;
      applyTenant(await publicTenantService.getTenantInfo(tenantId));
    } catch {
      setError(internalSlug ? NO_ORGANIZATION_ERROR : 'No se pudo cargar la información del tenant.');
    }
  }, [tenantId, applyTenant]);

  return (
    <TenantContext.Provider
      value={{
        tenantId,
        tenant,
        isLoading,
        error,
        statsTwoColsMobile: !!tenant?.settings?.stats_two_cols_mobile,
        refetchTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};
