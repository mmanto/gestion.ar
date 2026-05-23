import { useEffect, useRef } from 'react';
import { useWebSocketChat } from '../../hooks/useWebSocketChat';
import { ChatHeader } from './ChatHeader';
import { ChatInputBar } from './ChatInputBar';
import { TypingIndicator } from './TypingIndicator';

interface ChatInterfaceProps {
  botId?: string;
  channelId?: string;
}

export function ChatInterface({ botId, channelId }: ChatInterfaceProps) {
  const id = channelId ?? botId ?? '';
  const mode = channelId ? 'channel' : 'bot';
  const { messages, isConnected, isTyping, error, botName, sendMessage } =
    useWebSocketChat(id, mode);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto w-full bg-white shadow-xl">
      <ChatHeader botName={botName} isConnected={isConnected} />

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm text-center">
          {error}
        </div>
      )}

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-gray-50">
        {messages.length === 0 && !isConnected && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Conectando...
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isSystem = msg.role === 'system';

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                  {msg.content}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap break-words ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <ChatInputBar onSend={sendMessage} disabled={!isConnected} />
    </div>
  );
}
