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
  // Además de tokens_used/model, puede traer el shape de uno de los widgets
  // del chat (ver ChatWidgetData más abajo) — se mantiene laxo a nivel wire,
  // el narrowing seguro se hace con parseChatWidget.
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

export interface AppointmentOptionDTO {
  value: string;
  label: string;
}

// Paso previo al calendario cuando el bot tiene más de un recurso asociado
// al servicio (elegir especialidad, luego médico/cancha/ventanilla puntual)
// -- ver selection.strategy en appointment_booking_service.py.
export interface AppointmentOptionsWidget {
  widget_type: 'appointment_options';
  options: AppointmentOptionDTO[];
}

export type AppointmentWidget =
  | AppointmentCalendarWidget
  | AppointmentTimesWidget
  | AppointmentConfirmWidget
  | AppointmentOptionsWidget;

// --- Widget del padrón electoral (ver backend/app/modules/padron_ext.py) ---
// El backend manda la imagen del verificador como data URL: el chat es texto
// plano, así que sin widget no hay forma de mostrarla.

export interface PadronCaptchaWidgetData {
  widget_type: 'padron_captcha';
  image: string;
}

export type ChatWidgetData = AppointmentWidget | PadronCaptchaWidgetData;

/**
 * Narrowing defensivo del metadata laxo del wire. Devuelve null ante
 * cualquier shape inesperado — el caller simplemente no renderiza el widget
 * (queda el texto plano del mensaje como fallback), sin necesidad de
 * try/catch en el componente de render.
 */
export function parseChatWidget(metadata: Record<string, unknown> | undefined): ChatWidgetData | null {
  if (!metadata || typeof metadata.widget_type !== 'string') return null;

  switch (metadata.widget_type) {
    case 'appointment_calendar':
      return Array.isArray(metadata.days) ? (metadata as unknown as AppointmentCalendarWidget) : null;
    case 'appointment_times':
      return Array.isArray(metadata.slots) ? (metadata as unknown as AppointmentTimesWidget) : null;
    case 'appointment_confirm':
      return metadata.slot ? (metadata as unknown as AppointmentConfirmWidget) : null;
    case 'appointment_options':
      return Array.isArray(metadata.options) ? (metadata as unknown as AppointmentOptionsWidget) : null;
    case 'padron_captcha':
      return typeof metadata.image === 'string' ? (metadata as unknown as PadronCaptchaWidgetData) : null;
    default:
      return null;
  }
}
