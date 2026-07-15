import { useCallback, useEffect, useRef, useState } from 'react'

export interface StaffClientMessage {
  type: 'client_message'
  conversation_id: string
  client_id: string
  client_name: string
  channel: string
  content: string
  timestamp: string
}

export interface StaffClientConnected {
  type: 'client_connected'
  client_id: string
  client_name: string
  channel: string
}

export interface StaffClientTyping {
  type: 'client_typing'
  conversation_id: string
  client_id: string
}

type StaffIncomingEvent = StaffClientMessage | StaffClientConnected | StaffClientTyping

interface UseStaffWebSocketReturn {
  isConnected: boolean
  lastEvent: StaffIncomingEvent | null
  sendAgentMessage: (conversationId: string, content: string) => void
  sendTyping: (conversationId: string) => void
}

function buildStaffWsUrl(botId: string): string {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('No hay token de acceso')
  }
  const apiUrl = import.meta.env.VITE_API_URL || ''
  const baseHost = apiUrl.startsWith('http')
    ? apiUrl.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

  return `${baseHost}/ws/staff/chat/${botId}?token=${encodeURIComponent(token)}`
}

export function useStaffWebSocket(botId: string | null): UseStaffWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<StaffIncomingEvent | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const connect = useCallback(() => {
    if (!botId) return
    const existing = wsRef.current
    if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) {
      return
    }
    if (existing) {
      existing.close()
    }

    let wsUrl: string
    try {
      wsUrl = buildStaffWsUrl(botId)
    } catch {
      return // No token yet
    }

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const parsed: StaffIncomingEvent = JSON.parse(event.data)
        setLastEvent(parsed)
      } catch {
        // Ignorar mensajes no JSON (heartbeats, etc.)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      // Reconectar después de 5 segundos
      reconnectTimer.current = setTimeout(connect, 5000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [botId])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendAgentMessage = useCallback((conversationId: string, content: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: 'agent_message',
      conversation_id: conversationId,
      content,
    }))
  }, [])

  const sendTyping = useCallback((conversationId: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: 'agent_typing',
      conversation_id: conversationId,
    }))
  }, [])

  return {
    isConnected,
    lastEvent,
    sendAgentMessage,
    sendTyping,
  }
}
