import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Spinner } from '../common/Spinner';
import appointmentsService from '../../services/appointments.service';
import type {
  Appointment,
  AppointmentResource,
  AppointmentService,
  AppointmentSlot,
  AppointmentStatus,
} from '../../types/appointment.types';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  no_show: 'No asistió',
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
};

const dayKey = (isoOrDate: string | Date) =>
  typeof isoOrDate === 'string' ? isoOrDate.slice(0, 10) : format(isoOrDate, 'yyyy-MM-dd');

const errorDetail = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;

/**
 * Calendario de turnos del Escritorio -- reemplaza a StatsCards para
 * tenants de rubro 'salud' (ver Dashboard.tsx). Marca los días del mes que
 * tienen turnos asignados; al elegir un día se ve el detalle y se puede
 * confirmar/cancelar/reprogramar, o cargar uno nuevo.
 */
export const AppointmentsCalendar = () => {
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [resources, setResources] = useState<AppointmentResource[]>([]);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  // Memoizado por monthCursor: sin esto, gridStart/gridEnd eran objetos
  // Date NUEVOS en cada render (aunque el valor fuera el mismo), lo que
  // hacía que loadMonth (useCallback dependiente de ellos) cambiara de
  // referencia en cada render y disparara su useEffect en loop infinito --
  // de ahí las llamadas repetidas al backend reportadas en producción.
  const { gridStart, gridEnd } = useMemo(() => {
    const monthStart = startOfMonth(monthCursor);
    const monthEnd = endOfMonth(monthCursor);
    return {
      gridStart: startOfWeek(monthStart, { weekStartsOn: 1 }),
      gridEnd: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    };
  }, [monthCursor]);
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const resourceById = useMemo(
    () => Object.fromEntries(resources.map((r) => [r.id, r])),
    [resources]
  );

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, res, svc] = await Promise.all([
        appointmentsService.list({
          // El microservicio de turnos espera fecha simple (YYYY-MM-DD) acá,
          // no datetime completo -- devuelve 422 si se manda con hora.
          date_from: format(gridStart, 'yyyy-MM-dd'),
          date_to: format(gridEnd, 'yyyy-MM-dd'),
        }),
        appointmentsService.listResources(),
        appointmentsService.listServices(),
      ]);
      setAppointments(list.items);
      setResources(res);
      setServices(svc);
    } catch {
      setLoadError('No se pudieron cargar los turnos.');
    } finally {
      setLoading(false);
    }
  }, [gridStart, gridEnd]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const appointmentsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const appt of appointments) {
      if (appt.status === 'cancelled') continue;
      const key = dayKey(appt.start_at);
      (map[key] ??= []).push(appt);
    }
    Object.values(map).forEach((items) => items.sort((a, b) => a.start_at.localeCompare(b.start_at)));
    return map;
  }, [appointments]);

  const selectedAppointments = appointmentsByDay[dayKey(selectedDay)] || [];

  const handleConfirm = async (appt: Appointment) => {
    setActionError(null);
    try {
      await appointmentsService.confirm(appt.id);
      await loadMonth();
    } catch (err) {
      setActionError(errorDetail(err, 'No se pudo confirmar el turno.'));
    }
  };

  const handleCancel = async (appt: Appointment) => {
    if (!window.confirm('¿Cancelar este turno?')) return;
    setActionError(null);
    try {
      await appointmentsService.cancel(appt.id);
      await loadMonth();
    } catch (err) {
      setActionError(errorDetail(err, 'No se pudo cancelar el turno.'));
    }
  };

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthCursor((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-700"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide w-40 text-center capitalize">
            {format(monthCursor, 'MMMM yyyy', { locale: es })}
          </h3>
          <button
            type="button"
            onClick={() => setMonthCursor((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-700"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)} disabled={resources.length === 0}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo turno
        </Button>
      </div>

      {loadError && <Alert variant="error" className="mb-4">{loadError}</Alert>}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-gray-500 py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = dayKey(day);
              const dayAppointments = appointmentsByDay[key] || [];
              const inMonth = isSameMonth(day, monthCursor);
              const selected = isSameDay(day, selectedDay);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`aspect-square rounded-lg border text-left p-1.5 flex flex-col transition-colors ${
                    selected ? 'border-primary bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                  } ${!inMonth ? 'opacity-40' : ''}`}
                >
                  <span className={`text-xs ${isToday(day) ? 'font-bold text-primary' : 'text-gray-800'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayAppointments.length > 0 && (
                    <span className="mt-auto self-start inline-flex items-center gap-1 text-[10px] font-medium text-white bg-primary rounded-full px-1.5 py-0.5">
                      {dayAppointments.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-6 border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3 capitalize">
          Turnos del {format(selectedDay, "d 'de' MMMM", { locale: es })}
        </h4>

        {actionError && <Alert variant="error" className="mb-3">{actionError}</Alert>}

        {selectedAppointments.length === 0 ? (
          <p className="text-sm text-gray-500">No hay turnos asignados este día.</p>
        ) : (
          <ul className="space-y-2">
            {selectedAppointments.map((appt) => (
              <li
                key={appt.id}
                className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {format(parseISO(appt.start_at), 'HH:mm')}–{format(parseISO(appt.end_at), 'HH:mm')}
                    {' · '}
                    {resourceById[appt.resource_id]?.name || 'Recurso'}
                  </p>
                  <p className="text-xs text-gray-600 truncate">
                    {appt.metadata.customer_name || appt.customer_ref}
                    {appt.metadata.customer_phone ? ` · ${appt.metadata.customer_phone}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[appt.status]}`}>
                    {STATUS_LABELS[appt.status]}
                  </span>
                  {appt.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleConfirm(appt)}
                      className="text-xs text-green-700 hover:underline"
                    >
                      Confirmar
                    </button>
                  )}
                  {(appt.status === 'pending' || appt.status === 'confirmed') && (
                    <>
                      <button
                        type="button"
                        onClick={() => setRescheduling(appt)}
                        className="text-xs text-gray-700 hover:underline"
                      >
                        Reprogramar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(appt)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {formOpen && (
        <AppointmentFormModal
          resources={resources}
          services={services}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await loadMonth();
          }}
        />
      )}

      {rescheduling && (
        <AppointmentFormModal
          resources={resources}
          services={services}
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onSaved={async () => {
            setRescheduling(null);
            await loadMonth();
          }}
        />
      )}
    </Card>
  );
};

interface AppointmentFormModalProps {
  resources: AppointmentResource[];
  services: AppointmentService[];
  /** Si viene, el modal reprograma este turno en vez de crear uno nuevo. */
  appointment?: Appointment;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const AppointmentFormModal: React.FC<AppointmentFormModalProps> = ({
  resources,
  services,
  appointment,
  onClose,
  onSaved,
}) => {
  const isReschedule = !!appointment;
  const [resourceId, setResourceId] = useState(appointment?.resource_id || resources[0]?.id || '');
  const [serviceId, setServiceId] = useState(appointment?.service_id || '');
  const [date, setDate] = useState(() =>
    format(appointment ? parseISO(appointment.start_at) : new Date(), 'yyyy-MM-dd')
  );
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [customerName, setCustomerName] = useState(appointment?.metadata.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(appointment?.metadata.customer_phone || '');
  const [notes, setNotes] = useState(appointment?.metadata.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resourceId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSelectedSlot(null);
    appointmentsService
      // Fecha simple (YYYY-MM-DD), ver comentario en loadMonth() más arriba.
      .listSlots(resourceId, date, date, serviceId || undefined)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [resourceId, date, serviceId]);

  const handleSubmit = async () => {
    if (!selectedSlot) {
      setError('Elegí un horario disponible.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isReschedule && appointment) {
        await appointmentsService.reschedule(appointment.id, selectedSlot.start_at, selectedSlot.end_at);
      } else {
        await appointmentsService.create({
          resource_id: resourceId,
          service_id: serviceId || undefined,
          start_at: selectedSlot.start_at,
          end_at: selectedSlot.end_at,
          customer_name: customerName || undefined,
          customer_phone: customerPhone || undefined,
          notes: notes || undefined,
        });
      }
      await onSaved();
    } catch (err) {
      setError(errorDetail(err, 'No se pudo guardar el turno.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isReschedule ? 'Reprogramar turno' : 'Nuevo turno'}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Recurso</label>
          <select
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            disabled={isReschedule}
            className="block w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
          >
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {!isReschedule && services.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Servicio (opcional)</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="block w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sin especificar</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_minutes} min)
                </option>
              ))}
            </select>
          </div>
        )}

        <Input type="date" label="Fecha" value={date} onChange={(e) => setDate(e.target.value)} fullWidth />

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Horario disponible</label>
          {loadingSlots ? (
            <p className="text-sm text-gray-500">Buscando horarios...</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-gray-500">No hay horarios disponibles ese día.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.start_at}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
                    selectedSlot?.start_at === slot.start_at
                      ? 'border-primary bg-primary-50 text-primary'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {format(parseISO(slot.start_at), 'HH:mm')}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isReschedule && (
          <>
            <Input
              label="Nombre del paciente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              fullWidth
            />
            <Input
              label="Teléfono"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              fullWidth
            />
            <Input label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth />
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!selectedSlot}>
            {isReschedule ? 'Reprogramar' : 'Crear turno'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AppointmentsCalendar;
