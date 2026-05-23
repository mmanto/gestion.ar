import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { LoadingPage } from '../components/common/Spinner';
import ConversationDetail from '../components/conversations/ConversationDetail';
import conversationsService from '../services/conversations.service';
import type { Conversation } from '../types/conversation.types';

export const ConversationView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/conversations');
      return;
    }

    fetchConversation(id);
  }, [id]);

  const fetchConversation = async (conversationId: string) => {
    try {
      setLoading(true);
      const data = await conversationsService.getConversationById(conversationId);
      setConversation(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cargando conversación');
      console.error('Error fetching conversation:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-grow py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error}</p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!conversation) {
    return (
      <AppLayout>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">Conversación no encontrada</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Navbar />
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col w-4/5 mx-auto bg-white shadow-sm overflow-hidden">
          <ConversationDetail conversation={conversation} showMetadata={true} />
        </div>
      </main>
    </div>
  );
};
