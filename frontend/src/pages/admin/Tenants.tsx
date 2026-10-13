import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  DataTable,
  defineEntity,
  defineEntitySchema,
  defineTableDTO,
  EntityNavigateProvider,
  type TableDTO,
} from '@mmanto/devbout-ui';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import tenantAdminService from '../../services/tenantAdmin.service';
import type { Plan, Tenant, TenantStatus } from '../../types/tenant.types';

const statusLabels: Record<TenantStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  trial: 'Prueba',
};

const statusVariants: Record<TenantStatus, 'success' | 'destructive' | 'warning'> = {
  active: 'success',
  suspended: 'destructive',
  trial: 'warning',
};

export const Tenants = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  const fetchTenants = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
      const result = await tenantAdminService.listTenants(1, 100);
      setTenants(result.tenants);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando tenants');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
    tenantAdminService
      .listPlans()
      .then(setPlans)
      .catch(() => {});
  }, [fetchTenants]);

  /**
   * DTO de la grilla: el paquete resuelve buscador, orden, visibilidad de
   * columnas, paginación y las acciones. Alta, edición y detalle salen de una
   * sola declaración (`defineEntity`): un schema serializable (campos + labels)
   * más la glue (identidad, submit contra la API). El detalle se deriva del
   * mismo schema (badge para `status`, label del `select` para el plan, fecha
   * formateada), y la superficie de los tres modos sale de Ajustes › Vistas de
   * entidad.
   */
  const dto = useMemo<TableDTO<Tenant>>(() => {
    const planOptions = plans.map((plan) => ({
      value: plan.plan_id,
      label: plan.name,
    }));

    const entity = defineEntity<Tenant>({
      schema: defineEntitySchema({
        fields: [
          {
            kind: 'text',
            name: 'name',
            label: 'Nombre',
            placeholder: 'Ej: IUS Legal',
            required: true,
            rules: { maxLength: 80 },
          },
          {
            kind: 'text',
            name: 'domain',
            label: 'Dominio propio',
            placeholder: 'Ej: ius.legal',
          },
          {
            kind: 'select',
            name: 'status',
            label: 'Estado',
            defaultValue: 'trial',
            display: 'badge',
            options: (Object.keys(statusLabels) as TenantStatus[]).map((status) => ({
              value: status,
              label: statusLabels[status],
              variant: statusVariants[status],
            })),
          },
          {
            kind: 'select',
            name: 'plan_id',
            label: 'Plan',
            options: planOptions,
          },
          {
            // Derivado por el backend: se muestra en el detalle, no se edita.
            kind: 'date',
            name: 'created_at',
            label: 'Alta',
            formHidden: true,
          },
        ],
        labels: {
          createLabel: 'Nuevo Tenant',
          createTitle: 'Nuevo Tenant',
          createSubmit: 'Crear tenant',
          editLabel: 'Editar tenant',
          editSubmit: 'Guardar cambios',
          detailLabel: 'Ver resumen',
          detailClose: 'Cerrar',
          cancel: 'Cancelar',
          empty: '—',
          messages: { required: 'Este campo es obligatorio' },
        },
      }),
      rowId: (tenant) => tenant.tenant_id,
      onSubmit: async (values) => {
        // Sólo el alta pasa por acá: la edición va a la pantalla propia
        // (`edit.href`), que además edita la marca (logos, color, tagline) con el
        // uploader de la app.
        await tenantAdminService.createTenant({
          name: values.name.trim(),
          domain: values.domain.trim() || undefined,
          status: values.status as TenantStatus,
          plan_id: values.plan_id,
        });
        await fetchTenants({ silent: true });
      },
      create: { variant: 'default' },
      edit: { href: (tenant) => `/admin/tenants/${tenant.tenant_id}/editar` },
      detail: {
        title: (tenant) => tenant.name,
        description: (tenant) => tenant.domain || 'sin dominio asignado',
      },
    });

    return defineTableDTO<Tenant>({
      entity,
      // Sin columna de checks: la grilla se opera fila por fila.
      selectable: false,
      // Grilla controlada: al declarar `onDataChange` renderiza `data`, así el
      // refetch posterior a cada mutación se refleja en la tabla.
      onDataChange: (rows) => setTenants(rows),
      search: { columnId: 'name', placeholder: 'Buscar tenant' },
      columnLabels: {
        name: 'Tenant',
        domain: 'Dominio',
        status: 'Estado',
      },
      labels: {
        searchAction: 'Buscar',
        rowsPerPage: 'Filas por página',
        columns: 'Columnas',
        noResults: 'Sin resultados.',
        previous: 'Anterior',
        next: 'Siguiente',
        openRowMenu: 'Abrir acciones de la fila',
      },
      columns: [
        { id: 'name', accessorKey: 'name', header: 'Tenant' },
        {
          id: 'domain',
          header: 'Dominio',
          cell: ({ row }) =>
            row.original.domain || (
              <span className="italic text-muted-foreground">sin dominio asignado</span>
            ),
        },
        {
          id: 'status',
          header: 'Estado',
          cell: ({ row }) => (
            <Badge variant={statusVariants[row.original.status]}>
              {statusLabels[row.original.status]}
            </Badge>
          ),
        },
      ],
      rowActions: [
        {
          id: 'manage',
          label: 'Gestionar usuarios y módulos',
          run: (tenant) => navigate(`/admin/tenants/${tenant.tenant_id}`),
        },
      ],
    });
  }, [plans, fetchTenants, navigate]);

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Tenants"
          description={`${total} tenant${total !== 1 ? 's' : ''} en total`}
        />

        {error && <Alert variant="error">Error: {error}</Alert>}

        <EntityNavigateProvider navigate={navigate}>
          <DataTable dto={dto} data={tenants} />
        </EntityNavigateProvider>
      </div>
    </AppLayout>
  );
};

export default Tenants;
