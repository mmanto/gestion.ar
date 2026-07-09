import { useEffect, useRef } from 'react';
import { useWebSocketChat } from '../../hooks/useWebSocketChat';
import { parseAppointmentWidget } from '../../types/chat.types';
import { ChatHeader } from './ChatHeader';
import { ChatInputBar } from './ChatInputBar';
import { TypingIndicator } from './TypingIndicator';
import { AppointmentCalendarWidget } from './AppointmentCalendarWidget';
import { AppointmentTimesWidget } from './AppointmentTimesWidget';
import { AppointmentConfirmWidget } from './AppointmentConfirmWidget';

interface ChatInterfaceProps {
  botId?: string;
  channelId?: string;
}

export function ChatInterface({ botId, channelId }: ChatInterfaceProps) {
  const id = channelId ?? botId ?? '';
  const mode = channelId ? 'channel' : 'bot';
  const { messages, isConnected, isTyping, error, tenantName, sendMessage } =
    useWebSocketChat(id, mode);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Título de la pestaña/PWA = nombre del tenant, no "Asistente" genérico
  useEffect(() => {
    if (!tenantName) return;
    const previousTitle = document.title;
    document.title = tenantName;
    return () => {
      document.title = previousTitle;
    };
  }, [tenantName]);

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto w-full bg-white shadow-xl">
      <ChatHeader tenantName={tenantName} isConnected={isConnected} />

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

          const widget = !isUser ? parseAppointmentWidget(msg.metadata) : null;

          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex flex-col gap-2 ${widget ? 'max-w-[92%] w-full sm:max-w-[340px]' : 'max-w-[78%]'}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-300 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>

                {widget?.widget_type === 'appointment_calendar' && (
                  <AppointmentCalendarWidget widget={widget} onSelectDay={(d) => sendMessage(d)} />
                )}
                {widget?.widget_type === 'appointment_times' && (
                  <AppointmentTimesWidget
                    widget={widget}
                    onSelectTime={(s) => sendMessage(s)}
                    onBack={() => sendMessage('volver')}
                  />
                )}
                {widget?.widget_type === 'appointment_confirm' && (
                  <AppointmentConfirmWidget
                    widget={widget}
                    onConfirm={() => sendMessage('si')}
                    onDecline={() => sendMessage('no')}
                  />
                )}
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
