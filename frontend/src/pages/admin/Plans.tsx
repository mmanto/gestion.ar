import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  defineEntity,
  defineEntitySchema,
  defineTableDTO,
  type TableDTO,
} from '@mmanto/devbout-ui';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { Badge } from '../../components/ui/badge';
import { formatNumber } from '../../utils/formatters';
import tenantAdminService from '../../services/tenantAdmin.service';
import type { Plan, PlanPeriodicity } from '../../types/tenant.types';

const periodicityLabels: Record<PlanPeriodicity, string> = {
  monthly: 'Mensual',
  annual: 'Anual',
};

export const Plans = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      setPlans(await tenantAdminService.listPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando planes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  const handleDelete = useCallback(
    async (plan: Plan) => {
      try {
        await tenantAdminService.deletePlan(plan.plan_id);
        setError(null);
        await fetchPlans();
      } catch {
        setError('No se pudo eliminar: puede tener tenants suscriptos.');
      }
    },
    [fetchPlans],
  );

  /**
   * DTO de la grilla (mismo patrón que Tenants): el paquete resuelve buscador,
   * orden, visibilidad de columnas, paginación y las acciones. Alta y edición
   * salen de una sola declaración (`defineEntity`): el schema serializable
   * alimenta el formulario y el submit contra la API; no hay modal propio.
   */
  const dto = useMemo<TableDTO<Plan>>(() => {
    const entity = defineEntity<Plan>({
      schema: defineEntitySchema({
        fields: [
          {
            kind: 'text',
            name: 'name',
            label: 'Nombre',
            placeholder: 'Ej: Plan Pro',
            required: true,
            rules: { maxLength: 80 },
          },
          {
            kind: 'textarea',
            name: 'description',
            label: 'Descripción',
            rows: 3,
            placeholder: 'Descripción opcional del plan',
          },
          {
            kind: 'number',
            name: 'amount',
            label: 'Monto',
            placeholder: '0',
            min: 0,
            step: 0.01,
            required: true,
          },
          {
            kind: 'select',
            name: 'periodicity',
            label: 'Periodicidad',
            defaultValue: 'monthly',
            required: true,
            options: [
              { value: 'monthly', label: 'Mensual' },
              { value: 'annual', label: 'Anual' },
            ],
          },
        ],
        labels: {
          createLabel: 'Nuevo plan',
          createTitle: 'Nuevo plan',
          createSubmit: 'Crear plan',
          editLabel: 'Editar',
          editTitle: 'Editar plan',
          editSubmit: 'Guardar cambios',
          cancel: 'Cancelar',
          empty: '—',
          messages: {
            required: 'Este campo es obligatorio',
            min: 'El monto no puede ser negativo',
            maxLength: 'Máximo {n} caracteres',
          },
        },
      }),
      rowId: (plan) => plan.plan_id,
      onSubmit: async (values, row) => {
        const payload = {
          name: values.name.trim(),
          description: values.description.trim() || undefined,
          amount: Number(values.amount),
          periodicity: values.periodicity as PlanPeriodicity,
        };
        if (row) {
          await tenantAdminService.updatePlan(row.plan_id, payload);
        } else {
          await tenantAdminService.createPlan(payload);
        }
        await fetchPlans();
      },
      create: {},
      edit: {},
    });

    return defineTableDTO<Plan>({
      entity,
      // Sin columna de checks: se opera fila por fila.
      selectable: false,
      // Cabecera dentro del DataTable: hereda su layout (título + métricas
      // arriba del toolbar, con el mismo padding que el resto del componente).
      header: (rows) => (
        <PageHeader
          title="Planes"
          description={`${rows.length} plan${rows.length !== 1 ? 'es' : ''} en total`}
        />
      ),
      // Grilla controlada: al declarar `onDataChange` renderiza `data`, así el
      // refetch posterior a cada mutación se refleja en la tabla.
      onDataChange: setPlans,
      search: { columnId: 'name', placeholder: 'Buscar plan' },
      columnLabels: {
        name: 'Plan',
        periodicity: 'Periodicidad',
        amount: 'Monto',
      },
      labels: {
        searchAction: 'Buscar',
        rowsPerPage: 'Filas por página',
        columns: 'Columnas',
        noResults: 'Sin planes todavía.',
        previous: 'Anterior',
        next: 'Siguiente',
        openRowMenu: 'Abrir acciones de la fila',
      },
      columns: [
        {
          id: 'name',
          accessorKey: 'name',
          header: 'Plan',
          cell: ({ row }) => (
            <div className="grid">
              <span className="font-medium">{row.original.name}</span>
              {row.original.description && (
                <span className="text-xs text-muted-foreground">
                  {row.original.description}
                </span>
              )}
            </div>
          ),
        },
        {
          id: 'periodicity',
          header: 'Periodicidad',
          cell: ({ row }) => (
            <Badge variant="secondary">
              {periodicityLabels[row.original.periodicity]}
            </Badge>
          ),
        },
        {
          id: 'amount',
          header: 'Monto',
          cell: ({ row }) => (
            <span className="tabular-nums">$ {formatNumber(row.original.amount)}</span>
          ),
        },
      ],
      rowActions: [
        {
          id: 'delete',
          label: 'Eliminar',
          variant: 'destructive',
          run: (plan) => {
            void handleDelete(plan);
          },
        },
      ],
      confirm: {
        title: 'Eliminar plan',
        message: (count) =>
          count === 1
            ? '¿Eliminar este plan? Esta acción no se puede deshacer.'
            : `¿Eliminar ${count} planes? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
      },
    });
  }, [fetchPlans, handleDelete]);

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">Error: {error}</Alert>}

        <DataTable dto={dto} data={plans} />
      </div>
    </AppLayout>
  );
};

export default Plans;
