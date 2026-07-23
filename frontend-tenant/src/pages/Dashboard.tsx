import { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { Button } from '../components/common/Button';
import StatsCards from '../components/dashboard/StatsCards';
import { useStats } from '../hooks/useStats';
import { useColorStats } from '../hooks/useColorStats';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTemplate } from '../hooks/useTemplate';
import { TEMPLATE_MAP } from '../templates/registry';
import botsService from '../services/bots.service';
import { publicService } from '../services/public.service';
import type { TenantBotSummary } from '../types/bot.types';
import type { ColorFilter } from '../types/client.types';

const COLOR_LABELS: Record<ColorFilter, string> = {
  verde: 'Viable',
  amarillo: 'Potencial',
  rojo: 'Exploración',
  sin_clasificar: 'Sin clasificar',
};

export const Dashboard = () => {
  const { loading, error } = useStats();
  const { colorStats } = useColorStats();
  const isMobile = useIsMobile();
  const { templateId } = useTemplate();
  const ClientsGrid = TEMPLATE_MAP[templateId].ClientsGrid;
  const [selectedColor, setSelectedColor] = useState<ColorFilter | null>(null);
  const [bots, setBots] = useState<TenantBotSummary[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    botsService.getBots({ limit: 100 })
      .then((r) => {
        setBots(r.bots);
        if (r.bots.length > 0) setSelectedBotId(r.bots[0].bot_id);
      })
      .catch(() => {});
  }, []);

  const copyText = async (text: string) => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback para contextos sin Clipboard API (ej. dominios .test sin HTTPS en dev)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand('copy')) throw new Error('execCommand copy falló');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleSelectColor = (color: ColorFilter) => {
    setSelectedColor((prev) => (prev === color ? null : color));
  };

  const handleCopyChatLink = async () => {
    if (!selectedBotId) return;
    setCopyError(false);
    let publicUrl = window.location.origin;
    try {
      publicUrl = await publicService.getPublicUrl();
    } catch {
      // Sin URL pública configurada — se usa el origin actual como fallback
    }
    try {
      await copyText(`${publicUrl}/chat/${selectedBotId}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Error copiando el link:', err);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <AppLayout>
        <div className="font-editorial p-1 md:bg-[#F1F5F9] md:p-8">
          <PageHeader
            title="Escritorio"
            description="Resumen de actividad y métricas de tus agentes"
            titleClassName="font-semibold uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
          />
          <Alert variant="error">Error: {error}</Alert>
        </div>
      </AppLayout>
    );
  }

  if (isMobile) {
    return (
      <AppLayout>
        <div className="font-editorial p-1 md:bg-[#F1F5F9] md:p-8">
          {selectedColor === null ? (
            <>
              <PageHeader
                title="Escritorio"
                description="Tocá un card para ver esos clientes"
                titleClassName="font-semibold uppercase tracking-[0.08em]"
                descriptionClassName="text-gray-800"
              />
              <StatsCards colorStats={colorStats} selectedColor={selectedColor} onSelectColor={handleSelectColor} />
            </>
          ) : (
            <>
              <PageHeader
                title={COLOR_LABELS[selectedColor]}
                titleClassName="font-semibold uppercase tracking-[0.08em]"
                descriptionClassName="text-gray-800"
                onBack={() => setSelectedColor(null)}
              />
              <ClientsGrid colorFilter={selectedColor} />
            </>
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
        <div className="font-editorial p-1 md:bg-[#F1F5F9] md:p-8">
          <PageHeader
            title="Escritorio"
            description="Resumen de actividad y métricas de tus agentes"
            titleClassName="font-semibold uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
            actions={
              bots.length > 0 && (
                <Button variant="outline" onClick={handleCopyChatLink}>
                  {linkCopied ? '¡Copiado!' : 'Copiar link del chat'}
                </Button>
              )
            }
          />

          {copyError && (
            <Alert variant="error" className="mb-6">No se pudo copiar el link. Copialo manualmente desde la barra de direcciones.</Alert>
          )}

          {bots.length > 1 && (
            <div className="max-w-xs mb-6">
              <label className="block text-sm font-medium text-gray-900 mb-1">Agente</label>
              <select
                value={selectedBotId || ''}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="w-full px-4 py-2 border-0 rounded-lg bg-transparent"
              >
                {bots.map((b) => (
                  <option key={b.bot_id} value={b.bot_id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <StatsCards colorStats={colorStats} selectedColor={selectedColor} onSelectColor={handleSelectColor} />

          <ClientsGrid colorFilter={selectedColor ?? undefined} />
        </div>
    </AppLayout>
  );
};
