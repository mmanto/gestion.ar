import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
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
        <div className="flex flex-col gap-4">
          <Alert variant="error">Error: {error}</Alert>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
        <div className="flex flex-col gap-4">
          <PageHeader
            title="Conversaciones"
            description="Administra y revisa todas las conversaciones de tus clientes"
          />

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
        </div>
    </AppLayout>
  );
};
