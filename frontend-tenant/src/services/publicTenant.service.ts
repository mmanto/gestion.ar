import axios from 'axios';
import type { TenantPublicInfo } from '../types/tenant.types';

// BASE_URL ya incluye /api (ej: http://localhost:8000/api o /api en prod)
const BASE_URL = import.meta.env.VITE_API_URL?.startsWith('http')
  ? import.meta.env.VITE_API_URL
  : '/api';

const publicTenantService = {
  async getTenantInfo(tenantId: string): Promise<TenantPublicInfo> {
    const res = await axios.get(`${BASE_URL}/public/tenants/${tenantId}`);
    return res.data;
  },

  // Resuelve el tenant por el Host de la request (un único contenedor
  // frontend-tenant sirve a todos los tenants; ver GET /api/public/tenants/current).
  async getCurrentTenant(): Promise<TenantPublicInfo> {
    const res = await axios.get(`${BASE_URL}/public/tenants/current`);
    return res.data;
  },
};

export default publicTenantService;
