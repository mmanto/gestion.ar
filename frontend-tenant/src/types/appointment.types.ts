/**
 * Appointment types (frontend-tenant) - turnos del bot propio del tenant,
 * vía /api/tenant/appointments/* (ver tenant_appointments_router.py en el
 * backend). Espejo de los schemas AppointmentOut/ResourceOut/ServiceOut/
 * SlotOut del microservicio devbout-appointments.
 */

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
  id: string;
  resource_id: string;
  service_id: string | null;
  start_at: string;
  end_at: string;
  customer_ref: string;
  status: AppointmentStatus;
  metadata: {
    client_id?: string;
    customer_name?: string;
    customer_phone?: string;
    notes?: string;
    source?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

export interface AppointmentResource {
  id: string;
  name: string;
  category: string | null;
  capacity: number;
  timezone: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
}

export interface AppointmentService {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_cancellation_notice_minutes: number | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
}

export interface AppointmentSlot {
  resource_id: string;
  start_at: string;
  end_at: string;
}

export interface AppointmentListResponse {
  success: boolean;
  items: Appointment[];
  total: number;
  page: number;
  pages: number;
  limit: number;
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
