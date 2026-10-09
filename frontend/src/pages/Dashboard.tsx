import { BarChart3 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import StatsCards from '../components/dashboard/StatsCards';
import ActivityChart from '../components/dashboard/ActivityChart';
import ChartsSection from '../components/dashboard/ChartsSection';
import { useStats } from '../hooks/useStats';

export const Dashboard = () => {
  const { stats, timeline, loading, error } = useStats();

  if (loading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex flex-col gap-4">
          <PageHeader
            title="Dashboard"
            description="Resumen de actividad y métricas de tus agentes"
          />
          <Alert variant="error">Error: {error}</Alert>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
        <div className="flex flex-col gap-4">
          <PageHeader
            title="Dashboard"
            description="Resumen de actividad y métricas de tus agentes"
          />

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
