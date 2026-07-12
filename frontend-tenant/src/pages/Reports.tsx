import { BarChart3 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import ActivityChart from '../components/dashboard/ActivityChart';
import ChartsSection from '../components/dashboard/ChartsSection';
import { useStats } from '../hooks/useStats';

export const Reports = () => {
  const { stats, timeline, loading, error } = useStats();

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title="Reportes"
          description="Actividad, plataformas y costos de tus agentes"
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        {error && <Alert variant="error" className="mb-6">Error: {error}</Alert>}

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
            <ActivityChart timeline={timeline} />
            <ChartsSection stats={stats} timeline={timeline} />
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Reports;
