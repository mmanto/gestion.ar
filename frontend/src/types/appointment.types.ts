/**
 * Appointment types - TypeScript interfaces para la funcionalidad de turnos
 * (proxy de gestion.ar/backend sobre el microservicio devbout-appointments)
 */

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface AppointmentsConfig {
  resource_ids: string[];
  service_ids: string[];
  default_service_id: string | null;
}

export interface AppointmentsConfigUpdate {
  resource_ids?: string[];
  service_ids?: string[];
  default_service_id?: string | null;
}

export interface Resource {
  id: string;
  name: string;
  category: string | null;
  capacity: number;
  timezone: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResourceCreate {
  name: string;
  category?: string;
  capacity?: number;
  timezone?: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceUpdate {
  name?: string;
  category?: string;
  capacity?: number;
  timezone?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_cancellation_notice_minutes: number | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceCreate {
  name: string;
  duration_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  min_cancellation_notice_minutes?: number;
  metadata?: Record<string, unknown>;
}

export interface ServiceUpdate {
  name?: string;
  duration_minutes?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  min_cancellation_notice_minutes?: number;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export interface AvailabilityRule {
  id: string;
  weekday: number; // 0-6 (0 = lunes, ver devbout-appointments)
  start_time: string;
  end_time: string;
  valid_from: string | null;
  valid_until: string | null;
}

export interface AvailabilityRuleCreate {
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from?: string;
  valid_until?: string;
}

export interface Slot {
  resource_id: string;
  start_at: string;
  end_at: string;
}

export interface Appointment {
  id: string;
  resource_id: string;
  service_id: string | null;
  start_at: string;
  end_at: string;
  customer_ref: string;
  status: AppointmentStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

export interface ManualAppointmentCreate {
  resource_id: string;
  service_id?: string;
  start_at: string;
  end_at: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
}

export interface AppointmentFilters {
  status?: AppointmentStatus | '';
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface AppointmentsListResponse {
  success: boolean;
  items: Appointment[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
