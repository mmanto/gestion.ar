import React, { createContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { TenantPublicInfo } from '../types/tenant.types';
import publicTenantService from '../services/publicTenant.service';

// Inyectado en runtime por el entrypoint del contenedor (ver
// docker-entrypoint.sh / infra/tenant-config.js.template) — cada contenedor
// de frontend-tenant sirve a UN solo tenant, conocido al momento del deploy.
// En desarrollo local, sin ese script, se puede forzar con ?tenant=<id> en
// la URL (persistido en localStorage para no tener que repetirlo).
declare global {
  interface Window {
    __TENANT_CONFIG__?: { tenantId: string; statsTwoColsMobile?: boolean };
  }
}

const DEV_TENANT_STORAGE_KEY = 'gestionar-tenant-dev-override';

function resolveTenantId(): string | null {
  if (window.__TENANT_CONFIG__?.tenantId) {
    return window.__TENANT_CONFIG__.tenantId;
  }

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('tenant');
  if (fromQuery) {
    try {
      localStorage.setItem(DEV_TENANT_STORAGE_KEY, fromQuery);
    } catch {
      // ignorar si localStorage no está disponible
    }
    return fromQuery;
  }

  try {
    return localStorage.getItem(DEV_TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface TenantContextType {
  tenantId: string | null;
  tenant: TenantPublicInfo | null;
  isLoading: boolean;
  error: string | null;
  statsTwoColsMobile: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenantId] = useState<string | null>(resolveTenantId);
  const [tenant, setTenant] = useState<TenantPublicInfo | null>(null);
  const [isLoading, setIsLoading] = useState(() => tenantId !== null);
  const [error, setError] = useState<string | null>(() =>
    tenantId ? null : 'Este contenedor no tiene un tenant configurado.'
  );

  useEffect(() => {
    if (!tenantId) return;

    publicTenantService.getTenantInfo(tenantId)
      .then((info) => {
        setTenant(info);
        document.title = info.name;
      })
      .catch(() => setError('No se pudo cargar la información del tenant.'))
      .finally(() => setIsLoading(false));
  }, [tenantId]);

  return (
    <TenantContext.Provider
      value={{ tenantId, tenant, isLoading, error, statsTwoColsMobile: !!window.__TENANT_CONFIG__?.statsTwoColsMobile }}
    >
      {children}
    </TenantContext.Provider>
  );
};
