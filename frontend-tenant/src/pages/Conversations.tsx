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
        <div className="font-editorial p-1 md:bg-[#F1F5F9] md:p-8">
          <Alert variant="error">Error: {error}</Alert>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
        <div className="font-editorial p-1 md:bg-[#F1F5F9] md:p-8">
          <PageHeader
            title="Conversaciones"
            description="Administra y revisa todas las conversaciones de tus clientes"
            titleClassName="font-semibold uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
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
