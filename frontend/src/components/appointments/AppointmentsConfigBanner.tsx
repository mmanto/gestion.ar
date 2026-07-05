import { Link } from 'react-router-dom';
import type { AppointmentsConfig } from '../../types/appointment.types';

interface Props {
  botId: string;
  config: AppointmentsConfig | null;
}

export const AppointmentsConfigBanner = ({ botId, config }: Props) => {
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

  if (!config.enabled_in_chat) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">
          La reserva de turnos por chat está <strong>desactivada</strong>. Tus clientes no van a poder
          reservar charlando con el agente hasta que la actives en{' '}
          <Link to={`/bots/${botId}/appointments?tab=config`} className="underline">
            Configuración
          </Link>
          .
        </p>
      </div>
    );
  }

  return null;
};

export default AppointmentsConfigBanner;
