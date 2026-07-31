import { useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import StatsCards from '../components/dashboard/StatsCards';
import AppointmentsCalendar from '../components/dashboard/AppointmentsCalendar';
import { useStats } from '../hooks/useStats';
import { useColorStats } from '../hooks/useColorStats';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuth } from '../hooks/useAuth';
import { useTemplate } from '../hooks/useTemplate';
import { useTenant } from '../hooks/useTenant';
import { TEMPLATE_MAP } from '../templates/registry';
import type { ColorFilter } from '../types/client.types';

const COLOR_LABELS: Record<ColorFilter, string> = {
  verde: 'Viable',
  amarillo: 'Potencial',
  rojo: 'Exploración',
  sin_clasificar: 'Solicitan contacto',
};

export const Dashboard = () => {
  const { loading, error } = useStats();
  const { colorStats } = useColorStats();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const pageTitle = user ? [user.nombre, user.apellido].filter(Boolean).join(' ') || user.username : 'Escritorio';
  const { templateId } = useTemplate();
  const ClientsGrid = TEMPLATE_MAP[templateId].ClientsGrid;
  const [selectedColor, setSelectedColor] = useState<ColorFilter | null>(null);
  const { tenant } = useTenant();
  // Rubro 'salud' (ver BrandingSection.tsx / navLinks.tsx): el semáforo
  // verde/amarillo/rojo es un concepto propio de calificación de leads
  // (bots tipo IUS) que no aplica a un centro de salud -- se reemplaza por
  // el calendario de turnos, manteniendo la grilla de pacientes debajo.
  const isSalud = tenant?.branding.industry === 'salud';

  const handleSelectColor = (color: ColorFilter) => {
    setSelectedColor((prev) => (prev === color ? null : color));
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <AppLayout>
        <div className="font-editorial p-1 md:bg-[#F8F9FD] md:p-8">
          <PageHeader
            title={pageTitle}
            description="Resumen de actividad y métricas de tus agentes"
            titleClassName="font-semibold uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
          />
          <Alert variant="error">Error: {error}</Alert>
        </div>
      </AppLayout>
    );
  }

  if (isMobile) {
    if (isSalud) {
      return (
        <AppLayout>
          <div className="font-editorial p-1 md:bg-[#F8F9FD] md:p-8">
            <PageHeader
              title={pageTitle}
              description="Turnos y pacientes"
              titleClassName="font-semibold uppercase tracking-[0.08em]"
              descriptionClassName="text-gray-800"
            />
            <AppointmentsCalendar />
            <ClientsGrid />
          </div>
        </AppLayout>
      );
    }

    return (
      <AppLayout>
        <div className="font-editorial p-1 md:bg-[#F8F9FD] md:p-8">
          {selectedColor === null ? (
            <>
              <PageHeader
                title={pageTitle}
                description="Tocá un card para ver esos clientes"
                titleClassName="font-semibold uppercase tracking-[0.08em]"
                descriptionClassName="text-gray-800"
              />
              <StatsCards colorStats={colorStats} selectedColor={selectedColor} onSelectColor={handleSelectColor} />
            </>
          ) : (
            <>
              <PageHeader
                title={COLOR_LABELS[selectedColor]}
                titleClassName="font-semibold uppercase tracking-[0.08em]"
                descriptionClassName="text-gray-800"
                onBack={() => setSelectedColor(null)}
              />
              <ClientsGrid colorFilter={selectedColor} />
            </>
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
        <div className="font-editorial p-1 md:bg-[#F8F9FD] md:p-8">
          <PageHeader
            title={pageTitle}
            description="Resumen de actividad y métricas de tus agentes"
            titleClassName="font-semibold uppercase tracking-[0.08em]"
            descriptionClassName="text-gray-800"
          />

          {isSalud ? (
            <AppointmentsCalendar />
          ) : (
            <StatsCards colorStats={colorStats} selectedColor={selectedColor} onSelectColor={handleSelectColor} />
          )}

          <ClientsGrid colorFilter={isSalud ? undefined : (selectedColor ?? undefined)} />
        </div>
    </AppLayout>
  );
};
