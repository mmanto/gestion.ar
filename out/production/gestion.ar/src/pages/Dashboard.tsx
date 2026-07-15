import { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import StatsCards from '../components/dashboard/StatsCards';
import ProspectsGrid from '../components/dashboard/ProspectsGrid';
import { useStats } from '../hooks/useStats';
import botsService from '../services/bots.service';
import { publicService } from '../services/public.service';
import type { TenantBotSummary } from '../types/bot.types';

export const Dashboard = () => {
  const { stats, loading, error } = useStats();
  const [bots, setBots] = useState<TenantBotSummary[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    botsService.getBots({ limit: 100 })
      .then((r) => {
        setBots(r.bots);
        if (r.bots.length > 0) setSelectedBotId(r.bots[0].bot_id);
      })
      .catch(() => {});
  }, []);

  const handleCopyChatLink = async () => {
    if (!selectedBotId) return;
    try {
      let publicUrl = window.location.origin;
      try {
        publicUrl = await publicService.getPublicUrl();
      } catch {
        // Sin URL pública configurada — se usa el origin actual como fallback
      }
      await navigator.clipboard.writeText(`${publicUrl}/chat/${selectedBotId}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Error copiando el link:', err);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <AppLayout>
        <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
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

  return (
    <AppLayout>
        <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
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

          {bots.length > 1 && (
            <Card className="mb-6" shadow="none">
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-gray-900 mb-1">Agente</label>
                <select
                  value={selectedBotId || ''}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  {bots.map((b) => (
                    <option key={b.bot_id} value={b.bot_id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </Card>
          )}

          {stats && <StatsCards stats={stats} />}

          <ProspectsGrid />
        </div>
    </AppLayout>
  );
};
