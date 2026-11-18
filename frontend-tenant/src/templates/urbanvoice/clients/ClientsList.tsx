import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../../hooks/useTenant';
import partnerTenantsService from '../../../services/partnerTenants.service';
import type { PartnerTenant, PartnerTenantStatus } from '../../../types/partnerTenant.types';
import { useUvPermissions } from '../permissions';
import { UvIcon } from '../ui/UvIcon';
import { useToast } from '../ui/Toast';
import ClientModal from './modals/ClientModal';
import {
  clientMatches, formatDate, isClientOf, statusMeta, tenantColor, tenantInitials, tenantUrlLabel,
} from './tenantDisplay';

const CHIPS: Array<[PartnerTenantStatus | '', string]> = [
  ['', 'Todos'],
  ['active', 'Activos'],
  ['trial', 'En prueba'],
  ['suspended', 'Suspendidos'],
];

export default function ClientsList() {
  const { tenant } = useTenant();
  const perms = useUvPermissions();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [clients, setClients] = useState<PartnerTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PartnerTenantStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await partnerTenantsService.listTenants(1, 100);
      setClients(result.tenants.filter((t) => isClientOf(tenant?.tenant_id, t)));
    } catch {
      setError('No se pudieron cargar los clientes. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenant_id]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => clients.filter((c) => (!status || c.status === status) && clientMatches(c, q)),
    [clients, q, status],
  );

  const countOf = (key: PartnerTenantStatus | '') =>
    key ? clients.filter((c) => c.status === key).length : clients.length;

  const open = (tenantId: string) => navigate(`/clients/${tenantId}`);
  const onKey = (e: KeyboardEvent, tenantId: string) => {
    if (e.key === 'Enter') open(tenantId);
  };

  const setClientStatus = async (client: PartnerTenant, next: PartnerTenantStatus) => {
    setBusyId(client.tenant_id);
    try {
      const updated = await partnerTenantsService.updateTenant(client.tenant_id, { status: next });
      setClients((list) => list.map((c) => (c.tenant_id === updated.tenant_id ? updated : c)));
      showToast(<><b>{client.name}</b> {next === 'suspended' ? 'suspendido' : 'reactivado'}</>);
    } catch {
      showToast(<>No se pudo cambiar el estado de <b>{client.name}</b></>);
    } finally {
      setBusyId(null);
    }
  };

  const subtitle = clients.length
    ? `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'} en la plataforma · ${countOf('suspended')} suspendidos`
    : 'Clientes de UrbanVoice';

  return (
    <>
      <div className="vh">
        <div>
          <h1>Clientes</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="vh-a">
          <button type="button" className="btn pri" onClick={() => setCreateOpen(true)} disabled={!perms.isAdmin}>
            <UvIcon name="plus" />Nuevo cliente
          </button>
        </div>
      </div>

      <div className="card flt">
        <div className="srch in">
          <svg className="i"><use href="#o-search" /></svg>
          <input
            id="cf-q"
            placeholder="Buscar por nombre, dominio o nombre interno"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="chips" id="cf-st">
          {CHIPS.map(([key, label]) => (
            <button
              type="button"
              key={key || 'all'}
              data-s={key}
              className={status === key ? 'on' : ''}
              onClick={() => setStatus(key)}
            >
              {key ? <span className={`dot ${statusMeta(key).tone}`} /> : null}
              {label} <em>{countOf(key)}</em>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="alert bad">
          <UvIcon name="alert" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="card tbl-w">
        <table className="tbl clubs">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Acceso</th>
              <th>Estado</th>
              <th>Alta</th>
              <th />
            </tr>
          </thead>
          <tbody id="cl-b">
            {rows.map((client) => {
              const meta = statusMeta(client.status);
              return (
                <tr
                  key={client.tenant_id}
                  data-club={client.tenant_id}
                  tabIndex={0}
                  role="link"
                  onClick={() => open(client.tenant_id)}
                  onKeyDown={(e) => onKey(e, client.tenant_id)}
                >
                  <td data-l="Cliente">
                    <div className="cn">
                      <span className="clogo" style={{ width: 40, height: 40, background: tenantColor(client), fontSize: 15 }}>
                        {tenantInitials(client.name)}
                      </span>
                      <div>
                        <b>{client.name}</b>
                        <small>{client.slug ? `intellify.pro/${client.slug}` : 'sin nombre interno'}</small>
                      </div>
                    </div>
                  </td>
                  <td data-l="Acceso"><span className="url">{tenantUrlLabel(client)}</span></td>
                  <td data-l="Estado"><span className={`bdg ${meta.tone}`}>{meta.label}</span></td>
                  <td data-l="Alta"><small>{formatDate(client.created_at)}</small></td>
                  <td className="ra">
                    {client.status === 'suspended' ? (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busyId === client.tenant_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setClientStatus(client, 'active');
                        }}
                      >
                        Reactivar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busyId === client.tenant_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setClientStatus(client, 'suspended');
                        }}
                      >
                        Suspender
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading ? (
          <div className="empty"><b>Cargando clientes…</b></div>
        ) : rows.length ? null : (
          <div className="empty">
            <svg className="i"><use href="#o-search" /></svg>
            <b>{clients.length ? 'No hay clientes con ese filtro' : 'Todavía no hay clientes'}</b>
            <span>
              {clients.length
                ? 'Probá con otro estado o borrá la búsqueda.'
                : 'Usá «Nuevo cliente» para dar de alta el primero.'}
            </span>
          </div>
        )}
      </div>

      <ClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(client) => {
          setCreateOpen(false);
          setClients((list) => [client, ...list]);
          showToast(<><b>{client.name}</b> dado de alta</>);
          navigate(`/clients/${client.tenant_id}`);
        }}
      />
    </>
  );
}
