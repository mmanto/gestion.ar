import { Link } from 'react-router-dom';
import { Button } from '../common/Button';
import type { BotModuleInfo } from '../../types/tenant.types';

export interface ModuleConfigLink {
  label: string;
  path?: string; // navega a una ruta dedicada (ej. Turnos)
  onClick?: () => void; // ejecuta una acción en la página actual (ej. abrir edición del bot)
}

interface ModuleCardProps {
  module: BotModuleInfo;
  onToggleGrant: (moduleKey: string, granted: boolean) => void;
  updating: boolean;
  configLink?: ModuleConfigLink;
}

export const ModuleCard = ({ module, onToggleGrant, updating, configLink }: ModuleCardProps) => (
  <div className="flex items-center justify-between bg-gray-100 rounded-lg p-3">
    <div>
      <p className="font-medium text-gray-900">{module.module_name || module.module_key}</p>
      {module.module_description && (
        <p className="text-sm text-gray-900">{module.module_description}</p>
      )}
      <p className="text-xs text-gray-900 mt-1">
        {module.granted
          ? module.enabled
            ? 'Otorgado — habilitado por el tenant'
            : 'Otorgado — deshabilitado por el tenant'
          : 'No otorgado'}
      </p>
    </div>
    <div className="flex items-center gap-2">
      {module.granted && configLink && (
        configLink.path ? (
          <Link to={configLink.path}>
            <Button variant="outline">{configLink.label}</Button>
          </Link>
        ) : (
          <Button variant="outline" onClick={configLink.onClick}>
            {configLink.label}
          </Button>
        )
      )}
      <Button
        variant={module.granted ? 'danger' : 'primary'}
        onClick={() => onToggleGrant(module.module_key, module.granted)}
        disabled={updating}
      >
        {module.granted ? 'Revocar' : 'Otorgar'}
      </Button>
    </div>
  </div>
);

export default ModuleCard;
