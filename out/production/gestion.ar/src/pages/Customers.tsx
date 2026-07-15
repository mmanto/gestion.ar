import { Building2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';

export const Customers = () => {
  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title="Clientes"
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        <Card shadow="none">
          <EmptyState
            icon={<Building2 className="w-8 h-8 text-gray-800" />}
            title="Próximamente"
            description="Esta sección todavía no tiene contenido"
            titleClassName="text-gray-900 text-xl"
            descriptionClassName="text-gray-900 text-base"
          />
        </Card>
      </div>
    </AppLayout>
  );
};

export default Customers;
