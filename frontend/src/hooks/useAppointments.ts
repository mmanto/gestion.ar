/**
 * useAppointments hooks - React hooks para la funcionalidad de turnos
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  AppointmentsConfig,
  Resource,
  Service,
  AppointmentFilters,
  Appointment,
} from '../types/appointment.types';
import appointmentsService from '../services/appointments.service';

export const useAppointmentsConfig = (botId: string) => {
  const [config, setConfig] = useState<AppointmentsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!botId) return;
    try {
      setLoading(true);
      setError(null);
      setConfig(await appointmentsService.getConfig(botId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando la configuración de turnos');
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
};

export const useResources = (botId: string) => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    if (!botId) return;
    try {
      setLoading(true);
      setError(null);
      setResources(await appointmentsService.getResources(botId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando recursos');
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  return { resources, loading, error, refetch: fetchResources };
};

export const useServices = (botId: string) => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    if (!botId) return;
    try {
      setLoading(true);
      setError(null);
      setServices(await appointmentsService.getServices(botId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando servicios');
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return { services, loading, error, refetch: fetchServices };
};

export const useAppointmentsList = (botId: string, initialFilters: AppointmentFilters = {}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page || 1);
  const [pages, setPages] = useState(0);
  const [filters, setFilters] = useState<AppointmentFilters>(initialFilters);

  const fetchAppointments = useCallback(async () => {
    if (!botId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await appointmentsService.getAppointments(botId, { ...filters, page, page_size: 20 });
      setAppointments(response.items);
      setTotal(response.total);
      setPages(response.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando turnos');
    } finally {
      setLoading(false);
    }
  }, [botId, filters, page]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const updateFilters = useCallback((newFilters: Partial<AppointmentFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= pages) {
        setPage(newPage);
      }
    },
    [pages]
  );

  const refetch = useCallback(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  return { appointments, loading, error, total, page, pages, filters, updateFilters, goToPage, refetch };
};
