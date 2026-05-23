import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, WsClientMessage, WsServerMessage } from '../types/chat.types';

interface UseWebSocketChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  error: string | null;
  botName: string;
  sendMessage: (content: string) => void;
}

const DEVICE_ID_KEY = 'leadtrackers_device_id';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para contextos no-seguros (HTTP no-localhost)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function buildWsUrl(id: string, mode: 'bot' | 'channel'): string {
  const path = mode === 'channel' ? `/ws/chat/channel/${id}` : `/ws/chat/${id}`;
  const deviceId = getOrCreateDeviceId();
  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (apiUrl.startsWith('http')) {
    // Desarrollo: http://localhost:8000 → ws://localhost:8000
    return `${apiUrl.replace(/^http/, 'ws')}${path}?device_id=${deviceId}`;
  }
  // Docker/Nginx con VITE_API_URL=/api — derivar desde window.location
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}?device_id=${deviceId}`;
}

export function useWebSocketChat(id: string, mode: 'bot' | 'channel' = 'bot'): UseWebSocketChatReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botName, setBotName] = useState('');

  const wsUrl = useMemo(() => buildWsUrl(id, mode), [id, mode]);

  const connect = useCallback(() => {
    const existing = wsRef.current;
    // No reconectar si ya está abierto o conectándose
    if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) {
      return;
    }
    if (existing) {
      existing.close();
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event: MessageEvent) => {
      let data: WsServerMessage;
      try {
        data = JSON.parse(event.data as string) as WsServerMessage;
      } catch {
        return;
      }

      switch (data.type) {
        case 'welcome': {
          setBotName(data.bot_name);
          const msgs: ChatMessage[] = [];

          if (data.history && data.history.length > 0) {
            // Usuario que regresa: cargar historial previo
            for (const h of data.history) {
              msgs.push({
                id: crypto.randomUUID(),
                role: h.role,
                content: h.content,
                timestamp: h.timestamp,
                metadata: h.metadata,
              });
            }
          } else {
            // Primera visita: mostrar mensaje de bienvenida
            msgs.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: data.message,
              timestamp: new Date().toISOString(),
            });
          }

          setMessages(msgs);
          break;
        }
        case 'typing': {
          setIsTyping(data.status);
          break;
        }
        case 'message': {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
            metadata: data.metadata as Record<string, unknown> | undefined,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          break;
        }
        case 'error': {
          const errMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: data.message,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errMsg]);
          break;
        }
      }
    };

    ws.onerror = () => {
      setError('Error de conexión. Intenta recargar la página.');
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  // Reconectar al recuperar el foco (tab activa o ventana enfocada)
  useEffect(() => {
    const reconnectIfNeeded = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        connect();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') reconnectIfNeeded();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', reconnectIfNeeded);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', reconnectIfNeeded);
    };
  }, [connect]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const payload: WsClientMessage = { type: 'message', content };
    wsRef.current.send(JSON.stringify(payload));
  }, []);

  return { messages, isConnected, isTyping, error, botName, sendMessage };
}
