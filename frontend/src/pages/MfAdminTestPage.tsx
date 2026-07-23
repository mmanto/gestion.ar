// TEMPORAL — smoke test manual del panel admin federado (ADR-009, Fase 2).
// apiClient mockeado (no pega al backend real) para validar el wiring de MF
// + la inyección de props (ui/apiClient/accent) sin necesitar auth/tenant
// reales. Se borra después de verificar en browser.
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { lazy, Suspense } from 'react';

const RemoteAppointmentsWorkspace = lazy(() => import('appointments/AppointmentsWorkspace'));

const resources = [
  { id: 'r1', name: 'Consultorio 1', category: 'salud', capacity: 1, timezone: null, metadata: {}, is_active: true, created_at: '', updated_at: '' },
];
const services = [
  { id: 's1', name: 'Consulta', duration_minutes: 30, buffer_before_minutes: 0, buffer_after_minutes: 0, min_cancellation_notice_minutes: null, metadata: {}, is_active: true, created_at: '', updated_at: '' },
];

const mockApiClient = {
  async get(url: string) {
    console.log('[mockApiClient] GET', url);
    if (url.includes('/config')) return { data: { config: { resource_ids: ['r1'], service_ids: ['s1'], default_service_id: 's1' } } };
    if (url.includes('/resources/r1/availability-rules')) return { data: { items: [] } };
    if (url.includes('/services/s1/resources')) return { data: { items: [] } };
    if (url.includes('/resources')) return { data: { items: resources } };
    if (url.includes('/services')) return { data: { items: services } };
    if (url.match(/appointments(\?|$)/)) return { data: { success: true, items: [], total: 0, page: 1, pages: 0, limit: 20 } };
    return { data: { items: [] } };
  },
  async post(url: string) {
    console.log('[mockApiClient] POST', url);
    return { data: {} };
  },
  async patch(url: string) {
    console.log('[mockApiClient] PATCH', url);
    return { data: {} };
  },
  async put(url: string) {
    console.log('[mockApiClient] PUT', url);
    return { data: { config: { resource_ids: ['r1'], service_ids: ['s1'], default_service_id: 's1' } } };
  },
  async delete(url: string) {
    console.log('[mockApiClient] DELETE', url);
    return { data: {} };
  },
};

export default function MfAdminTestPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>MF admin smoke test</h1>
      <Suspense fallback={<p>Cargando remote...</p>}>
        <RemoteAppointmentsWorkspace
          botId="bot_test123"
          moduleInfo={{ granted: true, enabled: true, available: true, bot_id: 'bot_test123', module_key: 'appointments' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          apiClient={mockApiClient as any}
          ui={{ Input, Button, Card }}
          accent="#2793b4"
        />
      </Suspense>
    </div>
  );
}
