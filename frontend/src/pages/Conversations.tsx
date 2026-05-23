import { AppLayout } from '../components/layout/AppLayout';
import ConversationFilters from '../components/conversations/ConversationFilters';
import ConversationList from '../components/conversations/ConversationList';
import { useConversations } from '../hooks/useConversations';

export const Conversations = () => {
  const {
    conversations,
    loading,
    error,
    total,
    page,
    pages,
    updateFilters,
    goToPage,
  } = useConversations({ limit: 10 });

  if (error) {
    return (
      <AppLayout>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error}</p>
            </div>
    </AppLayout>
    );
  }

  return (
    <AppLayout>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Conversaciones</h1>
            <p className="mt-2 text-gray-600">
              Administra y revisa todas las conversaciones de tus clientes
            </p>
          </div>

          {/* Filters */}
          <div className="mb-6">
            <ConversationFilters onFiltersChange={updateFilters} totalResults={total} />
          </div>

          {/* Conversation List */}
          <ConversationList
            conversations={conversations}
            currentPage={page}
            totalPages={pages}
            onPageChange={goToPage}
            loading={loading}
          />
    </AppLayout>
  );
};
