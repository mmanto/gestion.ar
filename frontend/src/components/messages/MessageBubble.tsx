import { User, Bot, Info, Headphones } from 'lucide-react';
import { formatTime } from '../../utils/formatters';
import type { ConversationMessage } from '../../types/conversation.types';

interface MessageBubbleProps {
  message: ConversationMessage;
  showMetadata?: boolean;
}

const MessageBubble = ({ message, showMetadata = false }: MessageBubbleProps) => {
  const isUser = message.role === 'user';
  const isAgent = !isUser && message.metadata?.source === 'agent';

  const avatarClass = isUser
    ? 'bg-gradient-to-br from-primary to-secondary'
    : isAgent
    ? 'bg-teal-600'
    : 'bg-gray-600';

  const bubbleClass = isUser
    ? 'bg-gradient-to-r from-primary to-secondary text-white rounded-tr-none'
    : isAgent
    ? 'bg-teal-50 border border-teal-200 text-gray-900 rounded-tl-none'
    : 'bg-gray-200 text-gray-900 rounded-tl-none';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex gap-2 max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${avatarClass}`}
        >
          {isUser ? (
            <User className="w-5 h-5 text-white" />
          ) : isAgent ? (
            <Headphones className="w-5 h-5 text-white" />
          ) : (
            <Bot className="w-5 h-5 text-white" />
          )}
        </div>

        {/* Message Content */}
        <div className="flex flex-col">
          {isAgent && (
            <span className="text-xs text-teal-600 font-medium mb-0.5 px-1">Agente</span>
          )}
          <div className={`rounded-2xl px-4 py-2 ${bubbleClass}`}>
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          </div>

          {/* Timestamp and Metadata */}
          <div
            className={`flex items-center gap-2 mt-1 px-2 ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            <span className="text-xs text-gray-500">{formatTime(message.timestamp)}</span>

            {showMetadata && message.metadata && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Info className="w-3 h-3" />
                {message.metadata.tokens_used && (
                  <span>{message.metadata.tokens_used} tokens</span>
                )}
                {message.metadata.estimated_cost_usd && (
                  <span>• ${message.metadata.estimated_cost_usd.toFixed(6)}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
