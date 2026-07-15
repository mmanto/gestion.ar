/**
 * Bot types (frontend-tenant) - resumen read-only de los bots del propio
 * tenant. La configuración técnica completa (system_prompt, canales, RAG,
 * turnos) es responsabilidad de administración general, no de este app.
 */

export type BotStatus = 'active' | 'inactive' | 'maintenance';

export interface TenantBotSummary {
  bot_id: string;
  name: string;
  status: BotStatus;
  business_type: string;
}

export interface TenantBotsResponse {
  success: boolean;
  bots: TenantBotSummary[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
