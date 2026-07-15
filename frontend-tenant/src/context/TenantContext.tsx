import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { TenantPublicInfo } from '../types/tenant.types';
import publicTenantService from '../services/publicTenant.service';

// Inyectado en runtime por el entrypoint del contenedor (ver
// docker-entrypoint.sh / infra/tenant-config.js.template) — cada contenedor
// de frontend-tenant sirve a UN solo tenant, conocido al momento del deploy.
// En desarrollo local, sin ese script, se puede forzar con ?tenant=<id> en
// la URL (persistido en localStorage para no tener que repetirlo).
// En Capacitor (app nativa), el tenant se resuelve post-login desde user.tenant_id.
declare global {
  interface Window {
    __TENANT_CONFIG__?: { tenantId: string };
  }
}

// Expuesto por vite.config.ts — true cuando CAPACITOR_BUILD=1
declare const __CAPACITOR__: boolean;

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
      // ignorar si localStorage no esta disponible
    }
    return fromQuery;
  }

  try {
    const stored = localStorage.getItem(DEV_TENANT_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // ignorar
  }

  // En Capacitor (app nativa) el tenant no se conoce hasta despues del login.
  // No es un error — se resuelve desde user.tenant_id via setTenantId().
  if (typeof __CAPACITOR__ !== 'undefined' && __CAPACITOR__) {
    return null;
  }

  return null;
}

interface TenantContextType {
  tenantId: string | null;
  tenant: TenantPublicInfo | null;
  isLoading: boolean;
  error: string | null;
  setTenantId: (id: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenantId, setTenantIdState] = useState<string | null>(resolveTenantId);
  const [tenant, setTenant] = useState<TenantPublicInfo | null>(null);
  const [isLoading, setIsLoading] = useState(() => tenantId !== null);
  const [error, setError] = useState<string | null>(() =>
    tenantId ? null : (typeof __CAPACITOR__ !== 'undefined' && __CAPACITOR__)
      ? null  // Capacitor: tenant se resuelve post-login
      : 'Este contenedor no tiene un tenant configurado.'
  );

  const setTenantId = useCallback((id: string) => {
    setTenantIdState(id);
    setError(null);
    setIsLoading(true);
    publicTenantService.getTenantInfo(id)
      .then((info) => {
        setTenant(info);
        document.title = info.name;
      })
      .catch(() => setError('No se pudo cargar la informacion del tenant.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    publicTenantService.getTenantInfo(tenantId)
      .then((info) => {
        setTenant(info);
        document.title = info.name;
      })
      .catch(() => setError('No se pudo cargar la informacion del tenant.'))
      .finally(() => setIsLoading(false));
  }, [tenantId]);

  return (
    <TenantContext.Provider value={{ tenantId, tenant, isLoading, error, setTenantId }}>
      {children}
    </TenantContext.Provider>
  );
};
