/**
 * useChannels Hook - React hook for channel management
 */

import { useState, useEffect, useCallback } from 'react';
import type { Channel, ChannelFilters } from '../types/channel.types';
import channelsService from '../services/channels.service';

export const useChannels = (botId: string, initialFilters: ChannelFilters = {}) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page || 1);
  const [pages, setPages] = useState(0);
  const [filters, setFilters] = useState<ChannelFilters>(initialFilters);

  const fetchChannels = useCallback(async () => {
    if (!botId) {
      setChannels([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await channelsService.getChannels(botId, {
        ...filters,
        page,
        limit: filters.limit || 10,
      });

      setChannels(response.channels);
      setTotal(response.total);
      setPages(response.pages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando canales';
      setError(errorMessage);
      console.error('Error fetching channels:', err);
    } finally {
      setLoading(false);
    }
  }, [botId, filters, page]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const updateFilters = useCallback((newFilters: Partial<ChannelFilters>) => {
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
    fetchChannels();
  }, [fetchChannels]);

  return {
    channels,
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

export default useChannels;
