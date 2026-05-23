/**
 * useClients Hook - React hook for client management
 */

import { useState, useEffect, useCallback } from 'react';
import type { Client, ClientFilters } from '../types/client.types';
import clientsService from '../services/clients.service';

export const useClients = (botId: string, initialFilters: ClientFilters = {}) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page || 1);
  const [pages, setPages] = useState(0);
  const [filters, setFilters] = useState<ClientFilters>(initialFilters);

  const fetchClients = useCallback(async () => {
    if (!botId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await clientsService.getClients(botId, {
        ...filters,
        page,
        limit: filters.limit || 10,
      });

      setClients(response.clients);
      setTotal(response.total);
      setPages(response.pages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando clientes';
      setError(errorMessage);
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  }, [botId, filters, page]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const updateFilters = useCallback((newFilters: Partial<ClientFilters>) => {
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
    fetchClients();
  }, [fetchClients]);

  return {
    clients,
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

export default useClients;
