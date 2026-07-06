import { useEffect, useRef } from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import MessageBubble from './MessageBubble';
import type { ConversationMessage } from '../../types/conversation.types';

interface MessagesListProps {
  messages: ConversationMessage[];
  showMetadata?: boolean;
}

const MessagesList = ({ messages, showMetadata = false }: MessagesListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Group messages by date
  const getDateSeparator = (currentDate: string, previousDate?: string) => {
    if (!previousDate) return true;

    const current = parseISO(currentDate);
    const previous = parseISO(previousDate);

    return !isSameDay(current, previous);
  };

  const formatDateSeparator = (dateString: string) => {
    const date = parseISO(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(date, today)) {
      return 'Hoy';
    } else if (isSameDay(date, yesterday)) {
      return 'Ayer';
    } else {
      return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">No hay mensajes en esta conversación</p>
          <p className="text-sm mt-1">Los mensajes aparecerán aquí cuando se envíen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
      {messages.map((message, index) => {
        const showDateSeparator = getDateSeparator(
          message.timestamp,
          messages[index - 1]?.timestamp
        );

        return (
          <div key={`${message.timestamp}-${index}`}>
            {/* Date Separator */}
            {showDateSeparator && (
              <div className="flex items-center justify-center my-6">
                <div className="bg-gray-200 text-gray-600 text-xs font-medium px-3 py-1 rounded-full">
                  {formatDateSeparator(message.timestamp)}
                </div>
              </div>
            )}

            {/* Message Bubble */}
            <MessageBubble message={message} showMetadata={showMetadata} />
          </div>
        );
      })}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessagesList;
