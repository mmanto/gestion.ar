import { lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import api from '../services/api';
import type { BotModuleInfo } from '../types/tenant.types';

// Panel completo (tabs Turnos/Recursos/Servicios/Disponibilidad/Config),
// servido por devbout-appointments vía Module Federation — ver ADR-009,
// docs/dev/DECISIONS.md. La ruta lo monta detrás de ModuleGate, que resuelve
// la disponibilidad del módulo; Input/Button/Card y el cliente HTTP se
// inyectan por props en vez de que el remote los importe del host.
const RemoteAppointmentsWorkspace = lazy(() => import('appointments/AppointmentsWorkspace'));

export const BotAppointments = ({ moduleInfo }: { moduleInfo: BotModuleInfo }) => {
  const accent = 'var(--primary)';
  const { botId } = useParams<{ botId: string }>();

  if (!botId) return null;

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        <nav className="mb-4">
          <ol className="flex items-center space-x-2 text-base text-gray-900">
            <li>
              <Link to="/bots" className="hover:underline text-foreground">
                Agentes
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link to={`/bots/${botId}`} className="hover:underline text-foreground">
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
        />

        <Suspense fallback={<p className="text-gray-700">Cargando...</p>}>
          <RemoteAppointmentsWorkspace
            botId={botId}
            moduleInfo={moduleInfo}
            apiClient={api}
            ui={{ Input, Button, Card }}
            accent={accent}
          />
        </Suspense>
      </div>
    </AppLayout>
  );
};

export default BotAppointments;
