/**
 * Appointments Service (frontend-tenant) - turnos del bot propio del
 * tenant, vía /api/tenant/appointments (ver tenant_appointments_router.py).
 */

import api from './api';
import type {
  Appointment,
  AppointmentListResponse,
  AppointmentResource,
  AppointmentService,
  AppointmentSlot,
  ManualAppointmentCreate,
} from '../types/appointment.types';

const appointmentsService = {
  async list(filters: { date_from?: string; date_to?: string; status?: string } = {}): Promise<AppointmentListResponse> {
    const params = new URLSearchParams();
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.status) params.append('status', filters.status);
    const { data } = await api.get<AppointmentListResponse>(`/tenant/appointments?${params.toString()}`);
    return data;
  },

  async listResources(): Promise<AppointmentResource[]> {
    const { data } = await api.get<{ success: boolean; items: AppointmentResource[] }>('/tenant/appointments/resources');
    return data.items;
  },

  async listServices(): Promise<AppointmentService[]> {
    const { data } = await api.get<{ success: boolean; items: AppointmentService[] }>('/tenant/appointments/services');
    return data.items;
  },

  async listSlots(resourceId: string, dateFrom: string, dateTo: string, serviceId?: string): Promise<AppointmentSlot[]> {
    const params = new URLSearchParams({ resource_id: resourceId, date_from: dateFrom, date_to: dateTo });
    if (serviceId) params.append('service_id', serviceId);
    const { data } = await api.get<{ success: boolean; items: AppointmentSlot[] }>(`/tenant/appointments/slots?${params.toString()}`);
    return data.items;
  },

  async create(payload: ManualAppointmentCreate): Promise<Appointment> {
    const { data } = await api.post<{ success: boolean; appointment: Appointment }>('/tenant/appointments', payload);
    return data.appointment;
  },

  async reschedule(appointmentId: string, startAt: string, endAt: string): Promise<Appointment> {
    const { data } = await api.patch<{ success: boolean; appointment: Appointment }>(
      `/tenant/appointments/${appointmentId}`,
      { start_at: startAt, end_at: endAt }
    );
    return data.appointment;
  },

  async cancel(appointmentId: string, reason?: string): Promise<Appointment> {
    const { data } = await api.post<{ success: boolean; appointment: Appointment }>(
      `/tenant/appointments/${appointmentId}/cancel`,
      { reason }
    );
    return data.appointment;
  },

  async confirm(appointmentId: string): Promise<Appointment> {
    const { data } = await api.post<{ success: boolean; appointment: Appointment }>(
      `/tenant/appointments/${appointmentId}/confirm`
    );
    return data.appointment;
  },
};

export default appointmentsService;
