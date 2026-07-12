import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { useAccentTheme } from '../hooks/useAccentTheme';
import { ResourcesTab } from '../components/appointments/ResourcesTab';
import { ServicesTab } from '../components/appointments/ServicesTab';
import { AvailabilityTab } from '../components/appointments/AvailabilityTab';
import { AppointmentsTab } from '../components/appointments/AppointmentsTab';
import { AppointmentsConfigBanner } from '../components/appointments/AppointmentsConfigBanner';
import { useAppointmentsConfig, useServices } from '../hooks/useAppointments';
import appointmentsService from '../services/appointments.service';
import tenantAdminService from '../services/tenantAdmin.service';
import type { BotModuleInfo } from '../types/tenant.types';

const MODULE_KEY = 'appointments';

type TabKey = 'resources' | 'services' | 'availability' | 'appointments' | 'config';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'appointments', label: 'Turnos' },
  { key: 'resources', label: 'Recursos' },
  { key: 'services', label: 'Servicios' },
  { key: 'availability', label: 'Disponibilidad' },
  { key: 'config', label: 'Configuración' },
];

const ConfigTab = ({ botId, moduleInfo }: { botId: string; moduleInfo: BotModuleInfo | null }) => {
  const { config, loading, refetch } = useAppointmentsConfig(botId);
  const { services } = useServices(botId);
  const [saving, setSaving] = useState(false);

  if (loading || !config) {
    return <p className="text-gray-700">Cargando...</p>;
  }

  const handleDefaultServiceChange = async (serviceId: string) => {
    try {
      setSaving(true);
      await appointmentsService.updateConfig(botId, { default_service_id: serviceId || null });
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Configuración</h2>
        <p className="text-gray-800 mt-1">Cómo se ofrecen los turnos dentro del chat del agente</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Reserva de turnos por chat</p>
            <p className="text-sm text-gray-900">
              Se ofrece en el chat web cuando el módulo <strong>Turnos</strong> está otorgado y el
              tenant lo tiene habilitado (ver Módulos en el detalle del agente).
            </p>
          </div>
          <span
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              moduleInfo?.enabled ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-900'
            }`}
          >
            {moduleInfo?.enabled ? 'Activado' : moduleInfo?.granted ? 'Desactivado por el tenant' : 'No otorgado'}
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Servicio ofrecido por defecto en el chat
          </label>
          <select
            value={config.default_service_id || ''}
            onChange={(e) => handleDefaultServiceChange(e.target.value)}
            disabled={saving}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">Sin servicio específico</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-700 mt-1">
            La reserva por chat usa siempre el primer recurso creado y este servicio por defecto.
          </p>
        </div>
      </div>
    </div>
  );
};

export const BotAppointments = () => {
  const { accent } = useAccentTheme();
  const { botId } = useParams<{ botId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('appointments');
  const { config, refetch: refetchConfig } = useAppointmentsConfig(botId || '');
  const [moduleInfo, setModuleInfo] = useState<BotModuleInfo | null>(null);

  useEffect(() => {
    if (!botId) return;
    tenantAdminService
      .getBotModules(botId)
      .then((mods) => setModuleInfo(mods.find((m) => m.module_key === MODULE_KEY) || null))
      .catch(() => {});
  }, [botId]);

  if (!botId) return null;

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <nav className="mb-4">
          <ol className="flex items-center space-x-2 text-base text-gray-900">
            <li>
              <Link to="/bots" className="hover:underline" style={{ color: accent }}>
                Agentes
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link to={`/bots/${botId}`} className="hover:underline" style={{ color: accent }}>
                Agente
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-900">Turnos</li>
          </ol>
        </nav>

        <PageHeader
          title="Turnos"
          description="Gestión de recursos, servicios, disponibilidad y turnos reservados"
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        <AppointmentsConfigBanner botId={botId} config={config} moduleInfo={moduleInfo} />

        <div className="border-b border-gray-300 mb-6">
          <nav className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="pb-3 text-base font-medium border-b-2 -mb-px transition-colors"
                style={
                  activeTab === tab.key
                    ? { borderColor: accent, color: accent }
                    : { borderColor: 'transparent', color: '#4b5563' }
                }
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'appointments' && <AppointmentsTab botId={botId} />}
        {activeTab === 'resources' && <ResourcesTab botId={botId} onResourcesChanged={refetchConfig} />}
        {activeTab === 'services' && <ServicesTab botId={botId} onServicesChanged={refetchConfig} />}
        {activeTab === 'availability' && <AvailabilityTab botId={botId} />}
        {activeTab === 'config' && <ConfigTab botId={botId} moduleInfo={moduleInfo} />}
      </div>
    </AppLayout>
  );
};

export default BotAppointments;
