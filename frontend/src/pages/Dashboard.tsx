import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error}</p>
            </div>
    </AppLayout>
    );
  }

  if (!stats || !timeline) {
    return null;
  }

  return (
    <AppLayout>
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

          {/* Stats Cards */}
          <StatsCards stats={stats} />

          {/* Activity Chart */}
          <div className="mt-6">
            <ActivityChart timeline={timeline} />
          </div>

          {/* Additional Charts */}
          <ChartsSection stats={stats} timeline={timeline} />
    </AppLayout>
  );
};
