import { Star, Eye, FileText, MessageCircle, MessageSquare } from 'lucide-react';
import type { Client } from '../types/client.types';
import type { ActionMenuItem } from '../components/common/ActionMenu';
import { getWhatsappNumber } from './whatsapp';

interface ClientActionHandlers {
  onToggleDestacado: (client: Client) => void;
  onOpenDetail: (client: Client) => void;
  onOpenSummary: (client: Client) => void;
  onOpenConversation: (client: Client) => void;
  onOpenWhatsapp: (client: Client) => void;
}

export function buildClientActionItems(client: Client, handlers: ClientActionHandlers): ActionMenuItem[] {
  return [
    {
      key: 'destacado',
      label: client.destacado ? 'Quitar destacado' : 'Marcar como destacado',
      icon: Star,
      tone: 'yellow',
      active: client.destacado,
      onClick: () => handlers.onToggleDestacado(client),
    },
    {
      key: 'detail',
      label: 'Ver datos completos',
      icon: Eye,
      tone: 'default',
      onClick: () => handlers.onOpenDetail(client),
    },
    {
      key: 'summary',
      label: 'Ver resumen ejecutivo',
      icon: FileText,
      tone: 'amber',
      disabled: !client.notas,
      disabledReason: 'Sin resumen ejecutivo todavía',
      onClick: () => handlers.onOpenSummary(client),
    },
    {
      key: 'conversation',
      label: 'Ver historial de chat',
      icon: MessageCircle,
      tone: 'indigo',
      onClick: () => handlers.onOpenConversation(client),
    },
    {
      key: 'whatsapp',
      label: 'Abrir WhatsApp',
      icon: MessageSquare,
      tone: 'green',
      disabled: !getWhatsappNumber(client),
      disabledReason: 'Sin número de WhatsApp',
      onClick: () => handlers.onOpenWhatsapp(client),
    },
  ];
}
