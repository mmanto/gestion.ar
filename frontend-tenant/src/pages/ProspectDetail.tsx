import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import prospectsService from '../services/prospects.service';
import type { Prospect } from '../types/prospect.types';

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-sm font-medium text-gray-700">{label}</p>
    <p className="text-lg text-gray-900 mt-0.5">{value || '—'}</p>
  </div>
);

const semaforoDotClass: Record<string, string> = {
  verde: 'bg-green-500',
  amarillo: 'bg-yellow-500',
  rojo: 'bg-red-500',
};

export const ProspectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    prospectsService.getProspectById(id)
      .then(setProspect)
      .catch(() => setError('No se pudo cargar el prospecto'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title="Detalle del prospecto"
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
          actions={
            <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          }
        />

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        {prospect && (
          <Card shadow="none">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold text-gray-900">{prospect.nombre}</h2>
                  {prospect.color_semaforo && (
                    <span
                      title={`Calificación automática: ${prospect.color_semaforo}`}
                      className={`w-3 h-3 rounded-full ${semaforoDotClass[prospect.color_semaforo] || 'bg-gray-400'}`}
                    />
                  )}
                </div>
                <p className="text-sm text-gray-700 mt-1">{prospect.prospect_id}</p>
              </div>
              {prospect.whatsapp && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${prospect.whatsapp!.replace(/\D/g, '')}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  <MessageSquare className="w-4 h-4" />
                  Abrir WhatsApp
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label="Estado" value={prospect.estado} />
              <Field label="Canal" value={prospect.canal || ''} />
              <Field
                label="Última interacción"
                value={new Date(prospect.fecha_interaccion).toLocaleString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
              <Field label="WhatsApp" value={prospect.whatsapp || ''} />
              <Field label="Email" value={prospect.email || ''} />
            </div>

            {prospect.notas && (
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700">Notas (calificación automática)</p>
                <p className="text-base text-gray-900 mt-1 whitespace-pre-wrap">{prospect.notas}</p>
              </div>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default ProspectDetail;
