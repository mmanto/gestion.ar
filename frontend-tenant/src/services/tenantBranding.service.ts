/**
 * Tenant Branding Service - logo upload, branding text fields
 */

import api from './api';
import type { TenantBranding } from '../types/tenant.types';

const tenantBrandingService = {
  async uploadLogo(file: File, type: 'horizontal' | 'vertical' = 'horizontal'): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<{ success: boolean; url: string }>(
      `/tenant/branding/logo?type=${type}`,
      formData,
      { headers: { 'Content-Type': null } }
    );
    return data.url;
  },

  async updateBranding(payload: {
    primary_color?: string;
    tagline?: string;
  }): Promise<TenantBranding> {
    const { data } = await api.patch<{
      success: boolean;
      branding: TenantBranding;
    }>('/tenant/branding', payload);
    return data.branding;
  },

  async deleteLogo(type: 'horizontal' | 'vertical' = 'horizontal'): Promise<void> {
    await api.delete(`/tenant/branding/logo?type=${type}`);
  },
};

export default tenantBrandingService;
