import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { useTenant } from '../../hooks/useTenant';
import tenantBrandingService from '../../services/tenantBranding.service';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const ALLOWED_EXTENSIONS = '.jpg,.jpeg,.png,.webp,.svg';

export const BrandingSection = () => {
  const { tenant } = useTenant();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoUrl, setLogoUrl] = useState<string | undefined>(
    tenant?.branding.logo_url || undefined,
  );
  const [primaryColor, setPrimaryColor] = useState<string>(
    tenant?.branding.primary_color || '#25357a',
  );
  const [tagline, setTagline] = useState<string>(
    tenant?.branding.tagline || '',
  );

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [colorSaving, setColorSaving] = useState(false);
  const [taglineSaving, setTaglineSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Keep state in sync when tenant info refreshes
  useEffect(() => {
    if (tenant) {
      setLogoUrl(tenant.branding.logo_url || undefined);
      setPrimaryColor(tenant.branding.primary_color || '#25357a');
      setTagline(tenant.branding.tagline || '');
    }
  }, [tenant]);

  const flashSaved = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Formato no soportado — usá JPG, PNG, WEBP o SVG');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError('La imagen supera el tamaño máximo de 2MB');
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const url = await tenantBrandingService.uploadLogo(file);
      setLogoUrl(url);
      flashSaved('Logo actualizado');
    } catch {
      setUploadError('No se pudo subir el logo');
    } finally {
      setUploading(false);
    }
  };

  const handleColorChange = async (color: string) => {
    setPrimaryColor(color);
    setColorSaving(true);
    try {
      await tenantBrandingService.updateBranding({ primary_color: color });
      flashSaved('Color guardado');
    } catch {
      // revert on failure
    } finally {
      setColorSaving(false);
    }
  };

  const handleTaglineSave = async () => {
    setTaglineSaving(true);
    try {
      await tenantBrandingService.updateBranding({ tagline });
      flashSaved('Tagline guardada');
    } catch {
      // handled by interceptor toast
    } finally {
      setTaglineSaving(false);
    }
  };

  const handleDeleteLogo = async () => {
    setDeleting(true);
    try {
      await tenantBrandingService.deleteLogo();
      setLogoUrl(undefined);
      flashSaved('Logo eliminado');
    } catch {
      // handled by interceptor toast
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card shadow="none" className="mb-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Marca</h2>

      {saved && (
        <Alert variant="success" className="mb-4">
          {saved}
        </Alert>
      )}

      {/* Logo */}
      <div className="mb-6">
        <p className="text-xs font-medium text-gray-700 mb-2">Logo</p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo del tenant"
                className="w-full h-full object-contain"
              />
            ) : (
              <span
                className="text-3xl font-semibold text-white w-full h-full flex items-center justify-center"
                style={{ background: primaryColor }}
              >
                {tenant?.name?.charAt(0).toUpperCase() || '?'}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? 'Subiendo...' : 'Subir logo'}
              </Button>
              {logoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteLogo}
                  disabled={deleting}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-700">
              JPG, PNG, WEBP o SVG — hasta 2MB
            </p>
          </div>
        </div>
        {uploadError && (
          <p className="text-xs text-red-600 mt-1.5">{uploadError}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS}
          onChange={handleLogoSelect}
          className="hidden"
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
