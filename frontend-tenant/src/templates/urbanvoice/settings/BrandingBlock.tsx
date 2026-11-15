import { useRef } from 'react';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import {
  ALLOWED_EXTENSIONS,
  LOGO_HINTS,
  LOGO_LABELS,
  useBrandingSettings,
} from '../../../components/settings/useBrandingSettings';

interface LogoFieldProps {
  label: string;
  hint: string;
  url: string | undefined;
  fallbackColor: string;
  fallbackLetter: string;
  uploading: boolean;
  deleting: boolean;
  error: string | null;
  onSelect: (file: File) => void;
  onDelete: () => void;
}

function LogoField({
  label,
  hint,
  url,
  fallbackColor,
  fallbackLetter,
  uploading,
  deleting,
  error,
  onSelect,
  onDelete,
}: LogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resolved = resolveAssetUrl(url);

  return (
    <div className="uv-set-logo">
      <div className="uv-set-logo-prev">
        {resolved ? (
          <img src={resolved} alt={label} />
        ) : (
          <span style={{ background: fallbackColor }}>{fallbackLetter}</span>
        )}
      </div>
      <div className="uv-set-logo-meta">
        <b>{label}</b>
        <small>{hint}</small>
        <div className="uv-set-logo-actions">
          <button
            type="button"
            className="btn sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Subiendo…' : 'Subir'}
          </button>
          {url ? (
            <button type="button" className="btn sm danger" onClick={onDelete} disabled={deleting}>
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </button>
          ) : null}
        </div>
        {error ? <p className="uv-set-logo-err">{error}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onSelect(file);
        }}
      />
    </div>
  );
}

/** Marca del tenant con la presentación del tema UrbanVoice. */
export default function BrandingBlock() {
  const branding = useBrandingSettings();

  return (
    <section className="card uv-set-card">
      <header className="uv-set-head">
        <div>
          <h3>Marca</h3>
          <p>Logo, color, tagline y tema del panel.</p>
        </div>
        {branding.saved ? <span className="uv-set-status ok">{branding.saved}</span> : null}
      </header>

      {branding.error ? <div className="uv-set-alert err">{branding.error}</div> : null}

      <div className="uv-set-branding">
        <div className="uv-set-logos">
          <LogoField
            label={LOGO_LABELS.horizontal}
            hint={LOGO_HINTS.horizontal}
            url={branding.logoH}
            fallbackColor={branding.primaryColor}
            fallbackLetter={branding.fallbackLetter}
            uploading={branding.uploadingH}
            deleting={branding.deletingH}
            error={branding.uploadErrorH}
            onSelect={(file) => branding.handleLogoSelect('horizontal', file)}
            onDelete={() => branding.handleDeleteLogo('horizontal')}
          />
          <LogoField
            label={LOGO_LABELS.vertical}
            hint={LOGO_HINTS.vertical}
            url={branding.logoV}
            fallbackColor={branding.primaryColor}
            fallbackLetter={branding.fallbackLetter}
            uploading={branding.uploadingV}
            deleting={branding.deletingV}
            error={branding.uploadErrorV}
            onSelect={(file) => branding.handleLogoSelect('vertical', file)}
            onDelete={() => branding.handleDeleteLogo('vertical')}
          />
        </div>

        <div className="uv-set-fields">
          <div className="uv-set-field">
            <label htmlFor="uv-brand-color">Color principal</label>
            <div className="uv-set-color">
              <input
                id="uv-brand-color"
                type="color"
                value={branding.primaryColor}
                onChange={(event) => branding.handleColorChange(event.target.value)}
                disabled={branding.colorSaving}
              />
              <code>{branding.primaryColor}</code>
              {branding.colorSaving ? <span className="uv-set-hint">Guardando…</span> : null}
            </div>
          </div>

          <div className="uv-set-field">
            <label htmlFor="uv-brand-tagline">Tagline</label>
            <div className="uv-set-inline">
              <input
                id="uv-brand-tagline"
                type="text"
                value={branding.tagline}
                onChange={(event) => branding.setTagline(event.target.value)}
                maxLength={200}
                placeholder="Ej. Cuando la ciudad habla, vos escuchás."
              />
              <button
                type="button"
                className="btn pri sm"
                onClick={branding.handleTaglineSave}
                disabled={branding.taglineSaving}
              >
                {branding.taglineSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <p className="uv-set-hint">Aparece en la landing y en el login del tenant.</p>
          </div>

          <div className="uv-set-field">
            <label>Tema visual</label>
            <div className="uv-set-chips">
              {branding.templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={branding.templateId === template.id ? 'on' : undefined}
                  onClick={() => branding.handleThemeChange(template.id)}
                  disabled={branding.themeSaving}
                >
                  {template.label}
                </button>
              ))}
            </div>
            <p className="uv-set-hint">Cambia el panel completo de este tenant. El sitio público no cambia.</p>
          </div>

          <div className="uv-set-field">
            <label>Rubro</label>
            <div className="uv-set-chips">
              {branding.industryOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={branding.industry === option.id ? 'on' : undefined}
                  onClick={() => branding.handleIndustryChange(option.id)}
                  disabled={branding.industrySaving}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="uv-set-hint">Adapta el vocabulario del menú y del Escritorio.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
