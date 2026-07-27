import { lazy, Suspense, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { useAccentTheme } from '../hooks/useAccentTheme';
import api from '../services/api';
import tenantAdminService from '../services/tenantAdmin.service';
import type { BotModuleInfo } from '../types/tenant.types';

const MODULE_KEY = 'appointments';

// Panel completo (tabs Turnos/Recursos/Servicios/Disponibilidad/Config),
// servido por devbout-appointments vía Module Federation — ver ADR-009,
// docs/dev/DECISIONS.md. Solo se monta cuando moduleInfo.available es true
// (ver más abajo); Input/Button/Card y el cliente HTTP se inyectan por
// props en vez de que el remote los importe del host.
const RemoteAppointmentsWorkspace = lazy(() => import('appointments/AppointmentsWorkspace'));

const ModuleUnavailablePanel = () => (
  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
    <p className="text-yellow-800">
      El módulo <strong>Turnos</strong> no está disponible para este agente (ni otorgado ni incluido
      en el plan del tenant). Otorgalo desde el detalle del agente, o agregalo al plan del tenant,
      para poder configurarlo acá.
    </p>
  </div>
);

export const BotAppointments = () => {
  const { accent } = useAccentTheme();
  const { botId } = useParams<{ botId: string }>();
  const [moduleInfo, setModuleInfo] = useState<BotModuleInfo | null>(null);
  const [moduleLoading, setModuleLoading] = useState(true);

  useEffect(() => {
    if (!botId) return;
    setModuleLoading(true);
    tenantAdminService
      .getBotModules(botId)
      .then((mods) => setModuleInfo(mods.find((m) => m.module_key === MODULE_KEY) || null))
      .catch(() => {})
      .finally(() => setModuleLoading(false));
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

        {moduleLoading ? (
          <p className="text-gray-700">Cargando...</p>
        ) : moduleInfo?.available ? (
          <Suspense fallback={<p className="text-gray-700">Cargando...</p>}>
            <RemoteAppointmentsWorkspace
              botId={botId}
              moduleInfo={moduleInfo}
              apiClient={api}
              ui={{ Input, Button, Card }}
              accent={accent}
            />
          </Suspense>
        ) : (
          <ModuleUnavailablePanel />
        )}
      </div>
    </AppLayout>
  );
};

export default BotAppointments;
