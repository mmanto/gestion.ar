import { Link } from 'react-router-dom';
import type { AppointmentsConfig } from '../../types/appointment.types';
import type { BotModuleInfo } from '../../types/tenant.types';

interface Props {
  botId: string;
  config: AppointmentsConfig | null;
  moduleInfo: BotModuleInfo | null;
}

export const AppointmentsConfigBanner = ({ botId, config, moduleInfo }: Props) => {
  if (!config) return null;

  if (config.resource_ids.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">
          Todavía no configuraste ningún recurso reservable (consultorio, cancha, etc.). Creá uno en la
          pestaña <strong>Recursos</strong> para empezar a recibir turnos.
        </p>
      </div>
    );
  }

  if (moduleInfo && !moduleInfo.granted) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">
          El módulo <strong>Turnos</strong> no está otorgado a este agente. Otorgalo desde el detalle
          del agente para que el tenant pueda habilitarlo.
        </p>
      </div>
    );
  }

  if (moduleInfo && !moduleInfo.enabled) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">
          La reserva de turnos por chat está <strong>desactivada</strong> por el tenant. Tus clientes
          no van a poder reservar charlando con el agente hasta que la activen desde{' '}
          <Link to={`/bots/${botId}`} className="underline">
            Módulos
          </Link>
          .
        </p>
      </div>
    );
  }

  return null;
};

export default AppointmentsConfigBanner;
