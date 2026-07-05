/**
 * Appointments Service - HTTP service para la funcionalidad de turnos
 */

import api from './api';
import type {
  AppointmentsConfig,
  AppointmentsConfigUpdate,
  Resource,
  ResourceCreate,
  ResourceUpdate,
  Service,
  ServiceCreate,
  ServiceUpdate,
  AvailabilityRule,
  AvailabilityRuleCreate,
  Slot,
  Appointment,
  ManualAppointmentCreate,
  AppointmentFilters,
  AppointmentsListResponse,
} from '../types/appointment.types';

const base = (botId: string) => `/bots/${botId}/appointments`;

const appointmentsService = {
  // ── Config ──────────────────────────────────────────────────────────
  async getConfig(botId: string): Promise<AppointmentsConfig> {
    const response = await api.get(`${base(botId)}/config`);
    return response.data.config;
  },

  async updateConfig(botId: string, update: AppointmentsConfigUpdate): Promise<AppointmentsConfig> {
    const response = await api.put(`${base(botId)}/config`, update);
    return response.data.config;
  },

  // ── Resources ───────────────────────────────────────────────────────
  async getResources(botId: string): Promise<Resource[]> {
    const response = await api.get(`${base(botId)}/resources`);
    return response.data.items;
  },

  async createResource(botId: string, data: ResourceCreate): Promise<Resource> {
    const response = await api.post(`${base(botId)}/resources`, data);
    return response.data.resource;
  },

  async updateResource(botId: string, resourceId: string, data: ResourceUpdate): Promise<Resource> {
    const response = await api.patch(`${base(botId)}/resources/${resourceId}`, data);
    return response.data.resource;
  },

  async deleteResource(botId: string, resourceId: string): Promise<void> {
    await api.delete(`${base(botId)}/resources/${resourceId}`);
  },

  // ── Availability rules ─────────────────────────────────────────────
  async getAvailabilityRules(botId: string, resourceId: string): Promise<AvailabilityRule[]> {
    const response = await api.get(`${base(botId)}/resources/${resourceId}/availability-rules`);
    return response.data.items;
  },

  async createAvailabilityRule(
    botId: string,
    resourceId: string,
    data: AvailabilityRuleCreate
  ): Promise<AvailabilityRule> {
    const response = await api.post(`${base(botId)}/resources/${resourceId}/availability-rules`, data);
    return response.data.rule;
  },

  async deleteAvailabilityRule(botId: string, resourceId: string, ruleId: string): Promise<void> {
    await api.delete(`${base(botId)}/resources/${resourceId}/availability-rules/${ruleId}`);
  },

  // ── Services ────────────────────────────────────────────────────────
  async getServices(botId: string): Promise<Service[]> {
    const response = await api.get(`${base(botId)}/services`);
    return response.data.items;
  },

  async createService(botId: string, data: ServiceCreate): Promise<Service> {
    const response = await api.post(`${base(botId)}/services`, data);
    return response.data.service;
  },

  async updateService(botId: string, serviceId: string, data: ServiceUpdate): Promise<Service> {
    const response = await api.patch(`${base(botId)}/services/${serviceId}`, data);
    return response.data.service;
  },

  async deleteService(botId: string, serviceId: string): Promise<void> {
    await api.delete(`${base(botId)}/services/${serviceId}`);
  },

  async attachResourceToService(botId: string, serviceId: string, resourceId: string): Promise<void> {
    await api.post(`${base(botId)}/services/${serviceId}/resources`, { resource_id: resourceId });
  },

  async listServiceResources(botId: string, serviceId: string): Promise<Resource[]> {
    const response = await api.get(`${base(botId)}/services/${serviceId}/resources`);
    return response.data.items;
  },

  async detachResourceFromService(botId: string, serviceId: string, resourceId: string): Promise<void> {
    await api.delete(`${base(botId)}/services/${serviceId}/resources/${resourceId}`);
  },

  // ── Slots ───────────────────────────────────────────────────────────
  async getSlots(
    botId: string,
    params: { resource_id: string; date_from: string; date_to: string; service_id?: string }
  ): Promise<Slot[]> {
    const response = await api.get(`${base(botId)}/slots`, { params });
    return response.data.items;
  },

  // ── Appointments ────────────────────────────────────────────────────
  async getAppointments(botId: string, filters: AppointmentFilters = {}): Promise<AppointmentsListResponse> {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    params.append('page', String(filters.page || 1));
    params.append('page_size', String(filters.page_size || 20));

    const response = await api.get(`${base(botId)}?${params.toString()}`);
    return response.data;
  },

  async createAppointment(botId: string, data: ManualAppointmentCreate): Promise<Appointment> {
    const response = await api.post(base(botId), data);
    return response.data.appointment;
  },

  async getAppointment(botId: string, appointmentId: string): Promise<Appointment> {
    const response = await api.get(`${base(botId)}/${appointmentId}`);
    return response.data.appointment;
  },

  async rescheduleAppointment(
    botId: string,
    appointmentId: string,
    data: { start_at: string; end_at: string }
  ): Promise<Appointment> {
    const response = await api.patch(`${base(botId)}/${appointmentId}`, data);
    return response.data.appointment;
  },

  async cancelAppointment(botId: string, appointmentId: string, reason?: string): Promise<Appointment> {
    const response = await api.post(`${base(botId)}/${appointmentId}/cancel`, { reason });
    return response.data.appointment;
  },

  async confirmAppointment(botId: string, appointmentId: string): Promise<Appointment> {
    const response = await api.post(`${base(botId)}/${appointmentId}/confirm`);
    return response.data.appointment;
  },

  async completeAppointment(botId: string, appointmentId: string): Promise<Appointment> {
    const response = await api.post(`${base(botId)}/${appointmentId}/complete`);
    return response.data.appointment;
  },

  async markNoShow(botId: string, appointmentId: string): Promise<Appointment> {
    const response = await api.post(`${base(botId)}/${appointmentId}/no-show`);
    return response.data.appointment;
  },
};

export default appointmentsService;
