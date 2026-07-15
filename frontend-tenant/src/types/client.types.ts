/**
 * Client types - TypeScript interfaces for Client entity
 */

import type { SemaforoColor } from '../services/modules.service';

export type ClientSource = 'whatsapp' | 'telegram' | 'web' | 'manual';
export type ClientStatus = 'active' | 'blocked' | 'archived';
export type ColorFilter = SemaforoColor | 'sin_clasificar';
export type { SemaforoColor };

export interface Client {
  client_id: string;
  bot_id: string;
  external_id: string;
  source: ClientSource;
  name?: string;
  email?: string;
  phone?: string;
  dni?: string;
  status: ClientStatus;
  first_contact_at: string;
  last_contact_at: string;
  total_conversations: number;
  total_messages: number;
  total_tokens_used: number;
  score: number;
  metadata?: Record<string, unknown>;
  estado: string;
  color_semaforo?: SemaforoColor | null;
  notas?: string | null;
}

export interface ClientCreate {
  external_id: string;
  source: ClientSource;
  name?: string;
  email?: string;
  phone?: string;
  dni?: string;
  metadata?: Record<string, unknown>;
}

export interface ClientUpdate {
  name?: string;
  email?: string;
  phone?: string;
  dni?: string;
  status?: ClientStatus;
  score?: number;
  metadata?: Record<string, unknown>;
  color_semaforo?: SemaforoColor | null;
  notas?: string | null;
}

export interface ClientsResponse {
  success: boolean;
  clients: Client[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ClientResponse {
  success: boolean;
  client: Client;
  message?: string;
}

export interface ClientFilters {
  page?: number;
  limit?: number;
  status?: ClientStatus | '';
  search?: string;
  color_semaforo?: ColorFilter | '';
}

export interface ClientColorStats {
  verde: number;
  amarillo: number;
  rojo: number;
  sin_clasificar: number;
}
