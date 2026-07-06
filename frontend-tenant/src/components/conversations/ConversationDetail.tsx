import { useState, useRef } from 'react';
import { ArrowLeft, MessageSquare, Cpu, DollarSign, Calendar, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import MessagesList from '../messages/MessagesList';
import { formatDate, formatNumber, formatCurrency } from '../../utils/formatters';
import type { Conversation, ConversationMessage } from '../../types/conversation.types';
import conversationsService from '../../services/conversations.service';

interface ConversationDetailProps {
  conversation: Conversation;
  showMetadata?: boolean;
}

const ConversationDetail = ({ conversation, showMetadata = true }: ConversationDetailProps) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ConversationMessage[]>(conversation.messages);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getPlatformBadge = (platform?: string) => {
    const colors = {
      whatsapp: 'bg-green-100 text-green-800',
      telegram: 'bg-blue-100 text-blue-800',
      default: 'bg-gray-100 text-gray-800',
    };

    const colorClass = platform ? colors[platform as keyof typeof colors] || colors.default : colors.default;
    const displayName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Unknown';

    return (
      <span className={`px-3 py-1 text-xs font-medium rounded-full ${colorClass}`}>
        {displayName}
      </span>
    );
  };

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      const newMsg = await conversationsService.sendAgentMessage(conversation.conversation_id, content);
      setMessages((prev) => [...prev, newMsg]);
      setInputText('');
      textareaRef.current?.focus();
    } catch {
      // No-op: el usuario verá que el mensaje no apareció
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/conversations')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{conversation.user_id}</h1>
              <p className="text-sm text-gray-500">ID: {conversation.conversation_id}</p>
            </div>
          </div>
          <div>{getPlatformBadge(conversation.metadata?.source)}</div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs text-gray-600">Mensajes</p>
                <p className="text-lg font-semibold">{formatNumber(messages.length)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              <div>
                <p className="text-xs text-gray-600">Tokens</p>
                <p className="text-lg font-semibold">{formatNumber(conversation.total_tokens_used)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-pink-600" />
              <div>
                <p className="text-xs text-gray-600">Costo</p>
                <p className="text-lg font-semibold">{formatCurrency(conversation.total_cost_usd)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-secondary" />
              <div>
                <p className="text-xs text-gray-600">Actualizado</p>
                <p className="text-xs font-semibold">{formatDate(conversation.updated_at)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 bg-gray-50 overflow-hidden flex flex-col min-h-0">
        <MessagesList messages={messages} showMetadata={showMetadata} />
      </div>

      {/* Agent Composer */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Responder como agente… (Enter para enviar, Shift+Enter nueva línea)"
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white hover:bg-primary/90 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 pl-1">
          Mensaje enviado como agente · solo se guarda en el historial
        </p>
      </div>
    </div>
  );
};

export default ConversationDetail;
