import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { useTenant } from '../../hooks/useTenant';
import tenantBrandingService from '../../services/tenantBranding.service';
import { resolveAssetUrl } from '../../utils/assetUrl';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const ALLOWED_EXTENSIONS = '.jpg,.jpeg,.png,.webp,.svg';

type LogoType = 'horizontal' | 'vertical';

const LOGO_LABELS: Record<LogoType, string> = {
  horizontal: 'Logo horizontal',
  vertical: 'Logo vertical',
};

const LOGO_HINTS: Record<LogoType, string> = {
  horizontal: 'Se usa en la landing, login y menú expandido',
  vertical: 'Se usa en el login y menú colapsado',
};

const LogoUploadSlot: React.FC<{
  type: LogoType;
  url: string | undefined;
  fallbackColor: string;
  fallbackLetter: string;
  uploading: boolean;
  deleting: boolean;
  error: string | null;
  onSelect: (file: File) => void;
  onDelete: () => void;
}> = ({ type, url, fallbackColor, fallbackLetter, uploading, deleting, error, onSelect, onDelete }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onSelect(file);
  };

  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-2">{LOGO_LABELS[type]}</p>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
          {url ? (
            <img src={url} alt={LOGO_LABELS[type]} className="w-full h-full object-contain" />
          ) : (
            <span
              className="text-3xl font-semibold text-white w-full h-full flex items-center justify-center"
              style={{ background: fallbackColor }}
            >
              {fallbackLetter}
            </span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {uploading ? 'Subiendo...' : 'Subir'}
            </Button>
            {url && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-700">{LOGO_HINTS[type]}</p>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

export const BrandingSection = () => {
  const { tenant, refetchTenant } = useTenant();

  const [logoH, setLogoH] = useState<string | undefined>(
    tenant?.branding.logo_url_horizontal || tenant?.branding.logo_url || undefined,
  );
  const [logoV, setLogoV] = useState<string | undefined>(
    tenant?.branding.logo_url_vertical || undefined,
  );
  const [primaryColor, setPrimaryColor] = useState<string>(
    tenant?.branding.primary_color || '#25357a',
  );
  const [tagline, setTagline] = useState<string>(
    tenant?.branding.tagline || '',
  );

  const [uploadingH, setUploadingH] = useState(false);
  const [uploadingV, setUploadingV] = useState(false);
  const [uploadErrorH, setUploadErrorH] = useState<string | null>(null);
  const [uploadErrorV, setUploadErrorV] = useState<string | null>(null);
  const [deletingH, setDeletingH] = useState(false);
  const [deletingV, setDeletingV] = useState(false);
  const [colorSaving, setColorSaving] = useState(false);
  const [taglineSaving, setTaglineSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setLogoH(tenant.branding.logo_url_horizontal || tenant.branding.logo_url || undefined);
      setLogoV(tenant.branding.logo_url_vertical || undefined);
      setPrimaryColor(tenant.branding.primary_color || '#25357a');
      setTagline(tenant.branding.tagline || '');
    }
  }, [tenant]);

  const flashSaved = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
  };

  const handleLogoSelect = async (type: LogoType, file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      type === 'horizontal' ? setUploadErrorH('Formato no soportado — usá JPG, PNG, WEBP o SVG') : setUploadErrorV('Formato no soportado — usá JPG, PNG, WEBP o SVG');
      return;
    }
    if (file.size > MAX_BYTES) {
      type === 'horizontal' ? setUploadErrorH('La imagen supera el tamaño máximo de 2MB') : setUploadErrorV('La imagen supera el tamaño máximo de 2MB');
      return;
    }

    type === 'horizontal' ? (setUploadErrorH(null), setUploadingH(true)) : (setUploadErrorV(null), setUploadingV(true));
    try {
      const url = await tenantBrandingService.uploadLogo(file, type);
      type === 'horizontal' ? setLogoH(url) : setLogoV(url);
      await refetchTenant();
      flashSaved(`${LOGO_LABELS[type]} actualizado`);
    } catch {
      type === 'horizontal' ? setUploadErrorH('No se pudo subir el logo') : setUploadErrorV('No se pudo subir el logo');
    } finally {
      type === 'horizontal' ? setUploadingH(false) : setUploadingV(false);
    }
  };

  const handleDeleteLogo = async (type: LogoType) => {
    type === 'horizontal' ? setDeletingH(true) : setDeletingV(true);
    try {
      await tenantBrandingService.deleteLogo(type);
      type === 'horizontal' ? setLogoH(undefined) : setLogoV(undefined);
      await refetchTenant();
      flashSaved(`${LOGO_LABELS[type]} eliminado`);
    } catch {
      // handled by interceptor toast
    } finally {
      type === 'horizontal' ? setDeletingH(false) : setDeletingV(false);
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

  const fallbackLetter = (tenant?.name || '?').charAt(0).toUpperCase();

  return (
    <Card shadow="none" className="mb-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Marca</h2>

      {saved && (
        <Alert variant="success" className="mb-4">
          {saved}
        </Alert>
      )}

      <div className="space-y-6 mb-6">
        <LogoUploadSlot
          type="horizontal"
          url={resolveAssetUrl(logoH)}
          fallbackColor={primaryColor}
          fallbackLetter={fallbackLetter}
          uploading={uploadingH}
          deleting={deletingH}
          error={uploadErrorH}
          onSelect={(f) => handleLogoSelect('horizontal', f)}
          onDelete={() => handleDeleteLogo('horizontal')}
        />
        <LogoUploadSlot
          type="vertical"
          url={resolveAssetUrl(logoV)}
          fallbackColor={primaryColor}
          fallbackLetter={fallbackLetter}
          uploading={uploadingV}
          deleting={deletingV}
          error={uploadErrorV}
          onSelect={(f) => handleLogoSelect('vertical', f)}
          onDelete={() => handleDeleteLogo('vertical')}
        />
      </div>

      {/* Primary color */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-700 mb-2">Color principal</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-10 h-10 rounded border border-gray-300 cursor-pointer p-0.5"
            disabled={colorSaving}
          />
          <span className="text-sm text-gray-700">{primaryColor}</span>
          {colorSaving && (
            <span className="text-xs text-gray-700">Guardando...</span>
          )}
        </div>
      </div>

      {/* Tagline */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Tagline</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={200}
            placeholder="Ej: Abogados de confianza"
            className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleTaglineSave}
            disabled={taglineSaving}
          >
            {taglineSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default BrandingSection;
