import { useEffect, useState } from 'react';
import partnerTenantsService from '../../../../services/partnerTenants.service';
import { apiErrorDetail } from '../../../../utils/apiError';
import type { PartnerTenant, PartnerTenantBranding } from '../../../../types/partnerTenant.types';
import { useToast } from '../../ui/Toast';

interface DataTabProps {
  client: PartnerTenant;
  onUpdated: (client: PartnerTenant) => void;
}

interface FormState {
  name: string;
  domain: string;
  slug: string;
  tagline: string;
  primary_color: string;
  logo_url: string;
}

function formFrom(client: PartnerTenant): FormState {
  const branding = client.branding as PartnerTenantBranding;
  return {
    name: client.name,
    domain: client.domain ?? '',
    slug: client.slug ?? '',
    tagline: typeof branding.tagline === 'string' ? branding.tagline : '',
    primary_color: typeof branding.primary_color === 'string' ? branding.primary_color : '',
    logo_url: typeof branding.logo_url === 'string' ? branding.logo_url : '',
  };
}

export default function DataTab({ client, onUpdated }: DataTabProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => formFrom(client));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(formFrom(client));
    setError('');
  }, [client]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const dirty =
    form.name !== client.name ||
    form.domain !== (client.domain ?? '') ||
    form.slug !== (client.slug ?? '') ||
    form.tagline !== formFrom(client).tagline ||
    form.primary_color !== formFrom(client).primary_color ||
    form.logo_url !== formFrom(client).logo_url;

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError('');
    const branding: PartnerTenantBranding = {
      ...(client.branding as PartnerTenantBranding),
      tagline: form.tagline.trim(),
      primary_color: form.primary_color.trim(),
      logo_url: form.logo_url.trim(),
    };
    try {
      const updated = await partnerTenantsService.updateTenant(client.tenant_id, {
        name: form.name.trim(),
        domain: form.domain.trim(),
        slug: form.slug.trim(),
        branding,
      });
      onUpdated(updated);
      showToast(<><b>{updated.name}</b> actualizado</>);
    } catch (err) {
      setError(apiErrorDetail(err) || 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3>Datos del cliente</h3>
      <div className="fg2">
        <div>
          <label htmlFor="dt-name">Nombre</label>
          <input id="dt-name" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label htmlFor="dt-domain">Dominio propio</label>
          <input id="dt-domain" value={form.domain} onChange={set('domain')} placeholder="cliente.gob.ar" />
        </div>
      </div>
      <label htmlFor="dt-slug">Nombre interno (URL del apex)</label>
      <input id="dt-slug" value={form.slug} onChange={set('slug')} placeholder="nombre-interno" />
      <p className="muted sm">Se sirve en intellify.pro/&lt;nombre interno&gt;. Cambiarlo invalida la URL anterior.</p>

      <h3 style={{ marginTop: 22 }}>Marca</h3>
      <div className="fg2">
        <div>
          <label htmlFor="dt-tagline">Frase (tagline)</label>
          <input id="dt-tagline" value={form.tagline} onChange={set('tagline')} />
        </div>
        <div>
          <label htmlFor="dt-color">Color primario</label>
          <input id="dt-color" type="color" value={form.primary_color || '#087CF5'} onChange={set('primary_color')} />
        </div>
      </div>
      <label htmlFor="dt-logo">URL del logo</label>
      <input id="dt-logo" value={form.logo_url} onChange={set('logo_url')} placeholder="https://…" />

      {error ? <small className="lg-err">{error}</small> : null}

      <div className="m-a">
        <button type="button" className="btn pri" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn" onClick={() => setForm(formFrom(client))} disabled={!dirty}>
          Descartar
        </button>
      </div>
    </div>
  );
}
