/**
 * useBots Hook - React hook for bot management
 */

import { useState, useEffect, useCallback } from 'react';
import type { Bot, BotFilters } from '../types/bot.types';
import botsService from '../services/bots.service';

export const useBots = (initialFilters: BotFilters = {}) => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page || 1);
  const [pages, setPages] = useState(0);
  const [filters, setFilters] = useState<BotFilters>(initialFilters);

  const fetchBots = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await botsService.getBots({
        ...filters,
        page,
        limit: filters.limit || 10,
      });

      setBots(response.bots);
      setTotal(response.total);
      setPages(response.pages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando bots';
      setError(errorMessage);
      console.error('Error fetching bots:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  const updateFilters = useCallback((newFilters: Partial<BotFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= pages) {
        setPage(newPage);
      }
    },
    [pages]
  );

  const refetch = useCallback(() => {
    fetchBots();
  }, [fetchBots]);

  return {
    bots,
    loading,
    error,
    total,
    page,
    pages,
    filters,
    updateFilters,
    goToPage,
    refetch,
  };
};

export default useBots;
