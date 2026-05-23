// Tipos para el chat WebSocket

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// --- Mensajes servidor → cliente ---

export interface WsHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface WsWelcomeMessage {
  type: 'welcome';
  session_id: string;
  conversation_id: string;
  message: string;
  bot_name: string;
  history?: WsHistoryMessage[];
}

export interface WsTypingMessage {
  type: 'typing';
  status: boolean;
}

export interface WsAssistantMessage {
  type: 'message';
  role: 'assistant';
  content: string;
  metadata?: {
    tokens_used?: number;
    model?: string;
  };
}

export interface WsErrorMessage {
  type: 'error';
  message: string;
}

export type WsServerMessage =
  | WsWelcomeMessage
  | WsTypingMessage
  | WsAssistantMessage
  | WsErrorMessage;

// --- Mensaje cliente → servidor ---

export interface WsClientMessage {
  type: 'message';
  content: string;
}
