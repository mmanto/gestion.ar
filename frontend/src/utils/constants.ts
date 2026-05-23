// Configuración de la aplicación
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Asistente';
export const API_URL = import.meta.env.VITE_API_URL || '';

// Plataformas de mensajería
export const PLATFORMS = {
  WHATSAPP: 'whatsapp',
  TELEGRAM: 'telegram',
  OTHER: 'other',
} as const;

export type Platform = typeof PLATFORMS[keyof typeof PLATFORMS];

// Labels de plataformas
export const PLATFORM_LABELS: Record<Platform, string> = {
  [PLATFORMS.WHATSAPP]: 'WhatsApp',
  [PLATFORMS.TELEGRAM]: 'Telegram',
  [PLATFORMS.OTHER]: 'Otro',
};

// Colores de badges por plataforma
export const PLATFORM_COLORS: Record<Platform, string> = {
  [PLATFORMS.WHATSAPP]: 'bg-green-100 text-green-800',
  [PLATFORMS.TELEGRAM]: 'bg-blue-100 text-blue-800',
  [PLATFORMS.OTHER]: 'bg-gray-100 text-gray-800',
};

// Roles de mensajes
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const;

export type MessageRole = typeof MESSAGE_ROLES[keyof typeof MESSAGE_ROLES];

// Paginación por defecto
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// Opciones de ordenamiento
export const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Última actualización' },
  { value: 'created_at', label: 'Fecha de creación' },
  { value: 'total_tokens_used', label: 'Tokens usados' },
  { value: 'total_cost_usd', label: 'Costo' },
] as const;

export const SORT_ORDERS = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type SortOrder = typeof SORT_ORDERS[keyof typeof SORT_ORDERS];

// Límites de tiempo para stats
export const TIMELINE_OPTIONS = [
  { value: 7, label: 'Últimos 7 días' },
  { value: 14, label: 'Últimos 14 días' },
  { value: 30, label: 'Últimos 30 días' },
  { value: 90, label: 'Últimos 90 días' },
] as const;

// Colores para gráficas
export const CHART_COLORS = {
  primary: '#2793b4',
  secondary: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#06B6D4',
  purple: '#8B5CF6',
  pink: '#EC4899',
};

// Estados HTTP
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Mensajes de error comunes
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Error de conexión. Por favor, verifica tu conexión a internet.',
  UNAUTHORIZED: 'No tienes autorización. Por favor, inicia sesión nuevamente.',
  NOT_FOUND: 'El recurso solicitado no fue encontrado.',
  SERVER_ERROR: 'Error del servidor. Por favor, intenta nuevamente más tarde.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado. Por favor, intenta nuevamente.',
} as const;

// Duración de notificaciones (ms)
export const NOTIFICATION_DURATION = {
  SHORT: 2000,
  MEDIUM: 4000,
  LONG: 6000,
} as const;

// LocalStorage keys
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  THEME: 'theme',
} as const;

// Debounce delays (ms)
export const DEBOUNCE_DELAYS = {
  SEARCH: 500,
  FILTER: 300,
  TYPING: 1000,
} as const;
