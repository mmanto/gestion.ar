import { useContext } from 'react';
import { TenantContext } from '../context/TenantContext';

/**
 * Hook para acceder al tenant resuelto para este contenedor (branding público).
 *
 * @throws Error si se usa fuera de un TenantProvider
 */
export const useTenant = () => {
  const context = useContext(TenantContext);

  if (!context) {
    throw new Error('useTenant debe usarse dentro de un TenantProvider');
  }

  return context;
};
