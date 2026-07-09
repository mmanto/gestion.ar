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
  tenant_name: string;
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
  // Además de tokens_used/model, puede traer el shape de uno de los widgets
  // de reserva de turnos (ver AppointmentWidget más abajo) — se mantiene
  // laxo a nivel wire, el narrowing seguro se hace con parseAppointmentWidget.
  metadata?: Record<string, unknown>;
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

// --- Widgets de reserva de turnos por chat (ver appointment_booking_service.py) ---
// Viajan como el valor completo de ChatMessage.metadata cuando el mensaje del
// asistente ofrece un paso de la reserva (calendario -> horarios -> confirmar).

export interface AppointmentSlotDTO {
  start_at: string;
  end_at: string;
  label: string;
}

export interface AppointmentCalendarWidget {
  widget_type: 'appointment_calendar';
  days: string[];
  date_from: string;
  date_to: string;
  timezone: string;
  today: string;
}

export interface AppointmentTimesWidget {
  widget_type: 'appointment_times';
  date: string;
  timezone: string;
  slots: AppointmentSlotDTO[];
}

export interface AppointmentConfirmWidget {
  widget_type: 'appointment_confirm';
  date: string;
  timezone: string;
  slot: AppointmentSlotDTO & { label_day: string };
}

export type AppointmentWidget = AppointmentCalendarWidget | AppointmentTimesWidget | AppointmentConfirmWidget;

/**
 * Narrowing defensivo del metadata laxo del wire. Devuelve null ante
 * cualquier shape inesperado — el caller simplemente no renderiza el widget
 * (queda el texto plano del mensaje como fallback), sin necesidad de
 * try/catch en el componente de render.
 */
export function parseAppointmentWidget(metadata: Record<string, unknown> | undefined): AppointmentWidget | null {
  if (!metadata || typeof metadata.widget_type !== 'string') return null;

  switch (metadata.widget_type) {
    case 'appointment_calendar':
      return Array.isArray(metadata.days) ? (metadata as unknown as AppointmentCalendarWidget) : null;
    case 'appointment_times':
      return Array.isArray(metadata.slots) ? (metadata as unknown as AppointmentTimesWidget) : null;
    case 'appointment_confirm':
      return metadata.slot ? (metadata as unknown as AppointmentConfirmWidget) : null;
    default:
      return null;
  }
}
