import { useState } from 'react';
import { MessageSquare, MessageCircle, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../common/Button';
import { Drawer } from '../common/Drawer';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';
import MessagesList from '../messages/MessagesList';
import conversationsService from '../../services/conversations.service';
import { formatDate, formatCurrency, formatNumber, truncateText } from '../../utils/formatters';
import type { Conversation } from '../../types/conversation.types';

interface ConversationListProps {
  conversations: Conversation[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

const ConversationList = ({
  conversations,
  currentPage,
  totalPages,
  onPageChange,
  loading = false,
}: ConversationListProps) => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const handleOpenConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  const handleGenerateSummary = async (conversation: Conversation) => {
    setSummarizingId(conversation.conversation_id);
    try {
      const result = await conversationsService.generateSummary(conversation.conversation_id);
      setSummaryText(result.summary);
      setSummaryError(null);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setSummaryText('');
      setSummaryError(detail || 'No se pudo generar el resumen ejecutivo.');
    } finally {
      setSummarizingId(null);
      setSummaryDrawerOpen(true);
    }
  };

  const getPlatformBadge = (platform?: string) => {
    const colors = {
      whatsapp: 'bg-green-200 text-green-950',
      telegram: 'bg-blue-200 text-blue-950',
      default: 'bg-gray-200 text-gray-950',
    };

    const colorClass = platform ? colors[platform as keyof typeof colors] || colors.default : colors.default;
    const displayName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Unknown';

    return (
      <span className={`px-2 py-1 text-base font-medium rounded-full ${colorClass}`}>
        {displayName}
      </span>
    );
  };

  const getMessagePreview = (conversation: Conversation) => {
    if (conversation.messages.length === 0) return 'Sin mensajes';
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    return truncateText(lastMessage.content, 60);
  };

  if (loading) {
    return (
      <div className="py-12">
        <Spinner message="Cargando conversaciones..." />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <Table>
        <TableBody>
          <tr>
            <td>
              <EmptyState
                icon={<MessageSquare className="w-8 h-8 text-gray-800" />}
                title="No hay conversaciones"
                description="No se encontraron conversaciones con los filtros aplicados"
                titleClassName="text-gray-900 text-xl"
                descriptionClassName="text-gray-900 text-base"
              />
            </td>
          </tr>
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Usuario</TableHeaderCell>
            <TableHeaderCell>Plataforma</TableHeaderCell>
            <TableHeaderCell>Último mensaje</TableHeaderCell>
            <TableHeaderCell>Mensajes</TableHeaderCell>
            <TableHeaderCell>Tokens</TableHeaderCell>
            <TableHeaderCell>Costo</TableHeaderCell>
            <TableHeaderCell>Actualizado</TableHeaderCell>
            <TableHeaderCell align="right">Acciones</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {conversations.map((conversation) => (
            <TableRow key={conversation.conversation_id}>
              <TableCell>
                <div className="font-medium text-gray-900">{conversation.user_id}</div>
                <div className="text-sm text-gray-900">{conversation.conversation_id.slice(0, 8)}...</div>
              </TableCell>
              <TableCell>
                {getPlatformBadge(conversation.metadata?.source)}
              </TableCell>
              <TableCell className="max-w-md truncate">
                {getMessagePreview(conversation)}
              </TableCell>
              <TableCell>{formatNumber(conversation.messages.length)}</TableCell>
              <TableCell>{formatNumber(conversation.total_tokens_used)}</TableCell>
              <TableCell>{formatCurrency(conversation.total_cost_usd)}</TableCell>
              <TableCell>{formatDate(conversation.updated_at)}</TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenConversation(conversation)}
                    title="Ver conversación"
                    className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleGenerateSummary(conversation)}
                    title="Resumen ejecutivo"
                    disabled={summarizingId === conversation.conversation_id}
                    className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {summarizingId === conversation.conversation_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex justify-between items-center w-full">
            <div>
              <p className="text-base text-gray-900">
                Página <span className="font-medium">{currentPage}</span> de{' '}
                <span className="font-medium">{totalPages}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Siguiente
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title={selectedConversation ? selectedConversation.user_id : ''}
      >
        <MessagesList messages={selectedConversation?.messages ?? []} />
      </Drawer>

      <Drawer
        open={summaryDrawerOpen}
        onClose={() => setSummaryDrawerOpen(false)}
        title="Resumen ejecutivo"
      >
        <div className="p-6">
          {summaryError ? (
            <p className="text-red-600 text-sm">{summaryError}</p>
          ) : (
            <p className="text-base text-gray-900 whitespace-pre-wrap">{summaryText}</p>
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default ConversationList;
