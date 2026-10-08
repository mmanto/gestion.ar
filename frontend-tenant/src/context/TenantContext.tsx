import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { TenantPublicInfo } from '../types/tenant.types';
import publicTenantService from '../services/publicTenant.service';

// Un único contenedor frontend-tenant sirve a todos los tenants: el tenant se
// resuelve por el Host de la request contra GET /api/public/tenants/current
// (que matchea tenants.domain). En desarrollo local (sin dominio apuntando al
// backend) se fuerza con ?tenant=<id>, persistido en localStorage para no
// tener que repetirlo.
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

    // 1) Resolución por dominio (prod: Host -> tenants.domain).
    try {
      applyTenant(await publicTenantService.getCurrentTenant());
      return;
    } catch {
      // 404 o error de red: el Host no es un tenant — caer al override de dev.
    }

    // 2) Fallback de desarrollo: ?tenant=<id> (persistido en localStorage).
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
    if (!tenantId) return;
    try {
      applyTenant(await publicTenantService.getTenantInfo(tenantId));
    } catch {
      setError('No se pudo cargar la información del tenant.');
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
