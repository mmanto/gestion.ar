import { useEntityViewMode, type EntityViewMode } from '@mmanto/devbout-ui';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types/auth.types';

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Administración general',
  admin: 'Administrador',
  operativo: 'Operativo',
};

const viewModes: { value: EntityViewMode; label: string; description: string }[] = [
  {
    value: 'drawer',
    label: 'Panel lateral',
    description: 'Se desliza desde el costado de la pantalla.',
  },
  {
    value: 'modal',
    label: 'Modal',
    description: 'Centrado, sobre la grilla.',
  },
  {
    value: 'page',
    label: 'Página completa',
    description: 'Toma el área de contenido en lugar de la grilla.',
  },
];

/** Cómo se abre el alta/edición/detalle de las grillas (`@mmanto/devbout-ui`). */
const EntityViewCard = () => {
  const { mode, setMode } = useEntityViewMode();
  const active = viewModes.find((option) => option.value === mode);

  return (
    <Card shadow="none">
      <h2 className="text-xl font-semibold text-foreground mb-1">Vistas de entidad</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Cómo se abren el alta, la edición y el detalle de las grillas. Se guarda en este
        navegador.
      </p>
      <div className="flex flex-wrap gap-2">
        {viewModes.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={mode === option.value ? 'default' : 'outline'}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {active && <p className="mt-3 text-xs text-muted-foreground">{active.description}</p>}
    </Card>
  );
};

export const Settings = () => {
  const { user } = useAuth();

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Ajustes"
          description="Información de tu cuenta"
        />

        <Card shadow="none">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Mi cuenta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1">Usuario</p>
              <p className="text-sm text-gray-900">{user?.username}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1">Email</p>
              <p className="text-sm text-gray-900">{user?.email || '(No configurado)'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1">Rol</p>
              <p className="text-sm text-gray-900">{user ? roleLabels[user.role] : ''}</p>
            </div>
          </div>
        </Card>

        <EntityViewCard />
      </div>
    </AppLayout>
  );
};

export default Settings;
