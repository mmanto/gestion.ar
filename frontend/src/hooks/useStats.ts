import { useState, useEffect } from 'react';
import type { ConversationStats, TimelineStats } from '../types/conversation.types';
import statsService from '../services/stats.service';

export const useStats = () => {
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [statsData, timelineData] = await Promise.all([
        statsService.getStats(),
        statsService.getTimeline(30),
      ]);
      setStats(statsData);
      setTimeline(timelineData);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cargando estadísticas');
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return { stats, timeline, loading, error, refetch: fetchStats };
};
