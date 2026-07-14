import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { Navbar } from '../components/layout/Navbar'
import { Sidebar } from '../components/layout/Sidebar'
import { Footer } from '../components/layout/Footer'
import { LoadingPage } from '../components/common/Spinner'
import ConversationDetail from '../components/conversations/ConversationDetail'
import conversationsService from '../services/conversations.service'
import { useStaffWebSocket } from '../hooks/useStaffWebSocket'
import type { Conversation } from '../types/conversation.types'
import { useSidebar } from '../hooks/useSidebar'

export const ConversationView = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { collapsed } = useSidebar()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // WebSocket para mensajes en tiempo real (solo staff app)
  const botId = conversation?.bot_id ?? null
  const { lastEvent, isConnected: wsConnected } = useStaffWebSocket(botId)

  const fetchConversation = useCallback(async (conversationId: string) => {
    setLoading(true)
    try {
      const data = await conversationsService.getConversationById(conversationId)
      setConversation(data)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cargando conversación')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id) {
      navigate('/conversations')
      return
    }
    fetchConversation(id)
  }, [id, navigate, fetchConversation])

  // Agregar mensajes de clientes en tiempo real vía WebSocket
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'client_message') return
    if (lastEvent.conversation_id !== id) return

    setConversation((prev) => {
      if (!prev) return prev
      const newMsg = {
        id: `ws-${Date.now()}`,
        role: 'user' as const,
        content: lastEvent.content,
        timestamp: lastEvent.timestamp,
      }
      return { ...prev, messages: [...prev.messages, newMsg] }
    })
  }, [lastEvent, id])

  if (loading) {
    return <LoadingPage />
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <Sidebar />
        <main className={`flex-grow py-8 px-4 sm:px-6 lg:px-8 transition-all duration-300 ${collapsed ? 'md:ml-16' : 'md:ml-64'}`}>
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error}</p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!conversation) {
    return (
      <AppLayout>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">Conversación no encontrada</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Navbar />
      <Sidebar />
      <main className={`flex-1 flex flex-col overflow-hidden min-h-0 transition-all duration-300 ${collapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        {/* Indicador de conexión WebSocket */}
        {!wsConnected && (
          <div className="bg-yellow-100 text-yellow-800 text-xs text-center py-1">
            Sin conexión en tiempo real — recargá para ver nuevos mensajes
          </div>
        )}
        <div className="flex-1 flex flex-col w-4/5 mx-auto bg-white shadow-sm overflow-hidden">
          <ConversationDetail conversation={conversation} showMetadata={true} />
        </div>
      </main>
    </div>
  )
}
