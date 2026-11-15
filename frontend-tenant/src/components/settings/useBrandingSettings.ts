import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTenant } from '../../hooks/useTenant';
import { useTemplate } from '../../hooks/useTemplate';
import tenantBrandingService from '../../services/tenantBranding.service';
import type { TemplateId } from '../../types/template.types';
import type { TenantIndustry } from '../../types/tenant.types';

export const INDUSTRY_OPTIONS: { id: TenantIndustry; label: string }[] = [
  { id: 'legal', label: 'Legal' },
  { id: 'salud', label: 'Salud' },
  { id: 'generico', label: 'Genérico' },
];

export const MAX_BYTES = 2 * 1024 * 1024;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
export const ALLOWED_EXTENSIONS = '.jpg,.jpeg,.png,.webp,.svg';

export type LogoType = 'horizontal' | 'vertical';

export const LOGO_LABELS: Record<LogoType, string> = {
  horizontal: 'Logo horizontal',
  vertical: 'Logo vertical',
};

export const LOGO_HINTS: Record<LogoType, string> = {
  horizontal: 'Se usa en la landing, login y menú expandido',
  vertical: 'Se usa en el login y menú colapsado',
};

/**
 * Estado y acciones de Ajustes › Marca. Separado de la presentación para que
 * el backoffice clásico y el tema UrbanVoice compartan la misma lógica.
 */
export function useBrandingSettings() {
  const { tenant, refetchTenant } = useTenant();
  const { templateId, setTemplateId, templates } = useTemplate();

  const [logoH, setLogoH] = useState<string | undefined>(
    tenant?.branding.logo_url_horizontal || tenant?.branding.logo_url || undefined,
  );
  const [logoV, setLogoV] = useState<string | undefined>(
    tenant?.branding.logo_url_vertical || undefined,
  );
  const [primaryColor, setPrimaryColor] = useState<string>(
    tenant?.branding.primary_color || '#25357a',
  );
  const [tagline, setTagline] = useState<string>(tenant?.branding.tagline || '');
  const [industry, setIndustry] = useState<TenantIndustry>(
    tenant?.branding.industry || 'legal',
  );

  const [uploadingH, setUploadingH] = useState(false);
  const [uploadingV, setUploadingV] = useState(false);
  const [uploadErrorH, setUploadErrorH] = useState<string | null>(null);
  const [uploadErrorV, setUploadErrorV] = useState<string | null>(null);
  const [deletingH, setDeletingH] = useState(false);
  const [deletingV, setDeletingV] = useState(false);
  const [colorSaving, setColorSaving] = useState(false);
  const [taglineSaving, setTaglineSaving] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [industrySaving, setIndustrySaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setLogoH(tenant.branding.logo_url_horizontal || tenant.branding.logo_url || undefined);
      setLogoV(tenant.branding.logo_url_vertical || undefined);
      setPrimaryColor(tenant.branding.primary_color || '#25357a');
      setTagline(tenant.branding.tagline || '');
      setIndustry(tenant.branding.industry || 'legal');
    }
  }, [tenant]);

  const flashSaved = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
  };

  const handleLogoSelect = async (type: LogoType, file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      const msg = 'Formato no soportado — usá JPG, PNG, WEBP o SVG';
      if (type === 'horizontal') setUploadErrorH(msg);
      else setUploadErrorV(msg);
      return;
    }
    if (file.size > MAX_BYTES) {
      const msg = 'La imagen supera el tamaño máximo de 2MB';
      if (type === 'horizontal') setUploadErrorH(msg);
      else setUploadErrorV(msg);
      return;
    }

    if (type === 'horizontal') {
      setUploadErrorH(null);
      setUploadingH(true);
    } else {
      setUploadErrorV(null);
      setUploadingV(true);
    }
    try {
      const url = await tenantBrandingService.uploadLogo(file, type);
      if (type === 'horizontal') setLogoH(url);
      else setLogoV(url);
      await refetchTenant();
      flashSaved(`${LOGO_LABELS[type]} actualizado`);
    } catch {
      const msg = 'No se pudo subir el logo';
      if (type === 'horizontal') setUploadErrorH(msg);
      else setUploadErrorV(msg);
    } finally {
      if (type === 'horizontal') setUploadingH(false);
      else setUploadingV(false);
    }
  };

  const handleDeleteLogo = async (type: LogoType) => {
    if (type === 'horizontal') setDeletingH(true);
    else setDeletingV(true);
    try {
      await tenantBrandingService.deleteLogo(type);
      if (type === 'horizontal') setLogoH(undefined);
      else setLogoV(undefined);
      await refetchTenant();
      flashSaved(`${LOGO_LABELS[type]} eliminado`);
    } catch {
      // handled by interceptor toast
    } finally {
      if (type === 'horizontal') setDeletingH(false);
      else setDeletingV(false);
    }
  };

  const handleColorChange = async (color: string) => {
    setPrimaryColor(color);
    setColorSaving(true);
    try {
      await tenantBrandingService.updateBranding({ primary_color: color });
      await refetchTenant();
      flashSaved('Color guardado');
    } finally {
      setColorSaving(false);
    }
  };

  const handleTaglineSave = async () => {
    setTaglineSaving(true);
    try {
      await tenantBrandingService.updateBranding({ tagline });
      await refetchTenant();
      flashSaved('Tagline guardada');
    } finally {
      setTaglineSaving(false);
    }
  };

  const handleThemeChange = async (id: TemplateId) => {
    if (id === templateId) return;
    setThemeSaving(true);
    try {
      await setTemplateId(id);
      flashSaved('Tema guardado');
    } finally {
      setThemeSaving(false);
    }
  };

  const handleIndustryChange = async (value: TenantIndustry) => {
    if (value === industry) return;
    const previous = industry;
    setIndustry(value);
    setIndustrySaving(true);
    setError(null);
    try {
      await tenantBrandingService.updateBranding({ industry: value });
      await refetchTenant();
      flashSaved('Rubro guardado');
    } catch (err) {
      setIndustry(previous); // revertir ante error
      const detail =
        axios.isAxiosError(err) && typeof err.response?.data?.detail === 'string'
          ? err.response.data.detail
          : undefined;
      setError(detail || 'No se pudo guardar el rubro.');
    } finally {
      setIndustrySaving(false);
    }
  };

  return {
    tenant,
    templateId,
    templates,
    industryOptions: INDUSTRY_OPTIONS,
    logoH,
    logoV,
    primaryColor,
    tagline,
    industry,
    uploadingH,
    uploadingV,
    uploadErrorH,
    uploadErrorV,
    deletingH,
    deletingV,
    colorSaving,
    taglineSaving,
    themeSaving,
    industrySaving,
    saved,
    error,
    fallbackLetter: (tenant?.name || '?').charAt(0).toUpperCase(),
    setTagline,
    handleLogoSelect,
    handleDeleteLogo,
    handleColorChange,
    handleTaglineSave,
    handleThemeChange,
    handleIndustryChange,
  };
}
