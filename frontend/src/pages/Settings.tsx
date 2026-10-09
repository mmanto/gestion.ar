import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Card } from '../components/common/Card';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types/auth.types';

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Administración general',
  admin: 'Administrador',
  operativo: 'Operativo',
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
      </div>
    </AppLayout>
  );
};

export default Settings;
