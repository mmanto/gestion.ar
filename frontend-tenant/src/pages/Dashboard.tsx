import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import StatsCards from '../components/dashboard/StatsCards';
import ActivityChart from '../components/dashboard/ActivityChart';
import ChartsSection from '../components/dashboard/ChartsSection';
import { useStats } from '../hooks/useStats';
import botsService from '../services/bots.service';
import { publicService } from '../services/public.service';
import type { TenantBotSummary } from '../types/bot.types';

export const Dashboard = () => {
  const { stats, timeline, loading, error } = useStats();
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
            title="Dashboard"
            description="Resumen de actividad y métricas de tus agentes"
            titleClassName="font-light uppercase tracking-[0.08em]"
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
            title="Dashboard"
            description="Resumen de actividad y métricas de tus agentes"
            titleClassName="font-light uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
          />

          {bots.length > 0 && (
            <Card className="mb-6" shadow="none">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                {bots.length > 1 && (
                  <div className="flex-1">
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
                )}
                <Button variant="outline" onClick={handleCopyChatLink}>
                  {linkCopied ? '¡Copiado!' : 'Copiar link del chat'}
                </Button>
              </div>
            </Card>
          )}

          {!stats || !timeline ? (
            <Card shadow="none">
              <EmptyState
                icon={<BarChart3 className="w-8 h-8 text-gray-800" />}
                title="Todavía no hay datos"
                description="Las métricas aparecerán cuando tus agentes empiecen a recibir conversaciones"
                titleClassName="text-gray-900 text-xl"
                descriptionClassName="text-gray-900 text-base"
              />
            </Card>
          ) : (
            <>
              {/* Stats Cards */}
              <StatsCards stats={stats} />

              {/* Activity Chart */}
              <div className="mt-6">
                <ActivityChart timeline={timeline} />
              </div>

              {/* Additional Charts */}
              <ChartsSection stats={stats} timeline={timeline} />
            </>
          )}
        </div>
    </AppLayout>
  );
};
