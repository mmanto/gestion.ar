import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Card } from '../components/common/Card';
import type { BotModuleInfo } from '../types/tenant.types';

// DESHABILITADO TEMPORALMENTE — el panel de turnos llega por Module Federation
// desde devbout-appointments (ADR-009, docs/dev/DECISIONS.md), y ese remote
// inyecta su CSS global (Tailwind 3, preflight sin `@layer`) en el documento
// del host, pisando las utilidades de Tailwind 4 (los botones primarios
// quedaban transparentes). Se comentan el import del remote y sus props de
// inyección (`api`/`Input`/`Button`/`Card`) hasta corregir el remote; la
// pantalla muestra un aviso en su lugar.
//
// const RemoteAppointmentsWorkspace = lazy(() => import('appointments/AppointmentsWorkspace'));

export const BotAppointments = ({ moduleInfo }: { moduleInfo: BotModuleInfo }) => {
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

        <Card>
          <div className="flex flex-col gap-2">
            <p className="font-medium text-foreground">
              Turnos deshabilitado temporalmente
            </p>
            <p className="text-sm text-muted-foreground">
              El panel de turnos (<code className="text-xs">{moduleInfo.module_key}</code>) se sirve
              desde devbout-appointments vía Module Federation y su CSS global
              interfería con el diseño de la app. Se vuelve a habilitar cuando
              el remote deje de emitir su propio reset de estilos.
            </p>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

export default BotAppointments;
