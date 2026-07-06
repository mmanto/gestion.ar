import { useState, useEffect } from 'react';
import type { Conversation, ConversationFilters } from '../types/conversation.types';
import conversationsService from '../services/conversations.service';

export const useConversations = (initialFilters: ConversationFilters = {}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page || 1);
  const [pages, setPages] = useState(0);
  const [filters, setFilters] = useState<ConversationFilters>(initialFilters);

  useEffect(() => {
    fetchConversations();
  }, [filters, page]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await conversationsService.getConversations({
        ...filters,
        page,
        limit: filters.limit || 10,
      });

      setConversations(response.conversations);
      setTotal(response.total);
      setPages(response.pages);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cargando conversaciones');
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateFilters = (newFilters: Partial<ConversationFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1); // Reset to first page when filters change
  };

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= pages) {
      setPage(newPage);
    }
  };

  return {
    conversations,
    loading,
    error,
    total,
    page,
    pages,
    filters,
    updateFilters,
    goToPage,
    refetch: fetchConversations,
  };
};
