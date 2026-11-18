import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import partnerTenantsService from '../../../services/partnerTenants.service';
import type { PartnerTenant } from '../../../types/partnerTenant.types';
import { useUvPermissions } from '../permissions';
import { UvIcon } from '../ui/UvIcon';
import { useToast } from '../ui/Toast';
import { ConfirmModal } from './modals/ConfirmModal';
import BotsTab from './tabs/BotsTab';
import DataTab from './tabs/DataTab';
import UsersTab from './tabs/UsersTab';
import { formatDate, statusMeta, tenantColor, tenantInitials, tenantUrl } from './tenantDisplay';

type DetailTab = 'datos' | 'usuarios' | 'agentes';

interface ClientDetailProps {
  clientId: string;
}

export default function ClientDetail({ clientId }: ClientDetailProps) {
  const perms = useUvPermissions();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [client, setClient] = useState<PartnerTenant | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DetailTab>('datos');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setClient(null);
    setNotFound(false);
    setError('');
    partnerTenantsService
      .getTenant(clientId)
      .then((result) => {
        if (!cancelled) setClient(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true);
        else setError('No se pudo cargar el cliente.');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const replaceClient = useCallback((updated: PartnerTenant) => setClient(updated), []);

  const toggleSuspend = async () => {
    if (!client || busy) return;
    const next = client.status === 'suspended' ? 'active' : 'suspended';
    setBusy(true);
    try {
      const updated = await partnerTenantsService.updateTenant(client.tenant_id, { status: next });
      setClient(updated);
      showToast(<><b>{updated.name}</b> {next === 'suspended' ? 'suspendido' : 'reactivado'}</>);
    } catch {
      showToast(<>No se pudo cambiar el estado de <b>{client.name}</b></>);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!client) return;
    setBusy(true);
    setDeleteError('');
    try {
      await partnerTenantsService.deleteTenant(client.tenant_id);
      showToast(<><b>{client.name}</b> eliminado</>);
      navigate('/clients');
    } catch (err) {
      setDeleteError(
        axios.isAxiosError<{ detail?: string }>(err) && err.response?.status === 409
          ? 'El cliente tiene usuarios, canales o conversaciones. Eliminá primero esos datos.'
          : 'No se pudo eliminar el cliente.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (notFound) return <Navigate to="/clients" replace />;

  if (!client) {
    return (
      <>
        <Link className="back" to="/clients"><UvIcon name="left" />Clientes</Link>
        <div className="card">
          <p className="muted">{error || 'Cargando cliente…'}</p>
        </div>
      </>
    );
  }

  const meta = statusMeta(client.status);
  const url = tenantUrl(client);
  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: 'datos', label: 'Datos' },
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'agentes', label: 'Agentes y módulos' },
  ];

  return (
    <>
      <Link className="back" to="/clients"><UvIcon name="left" />Clientes</Link>
      <div className="ch-h card">
        <div className="ch-id">
          <span className="clogo" style={{ width: 64, height: 64, background: tenantColor(client), fontSize: 24 }}>
            {tenantInitials(client.name)}
          </span>
          <div>
            <h1>{client.name}</h1>
            <p className="muted">Cliente desde {formatDate(client.created_at)}</p>
            <div className="ch-b">
              <span className={`bdg ${meta.tone}`}>{meta.label}</span>
              {url ? (
                <a className="url" href={url} target="_blank" rel="noopener noreferrer">
                  <UvIcon name="ext" />{client.domain || `intellify.pro/${client.slug}`}
                </a>
              ) : (
                <span className="url">Sin URL asignada</span>
              )}
            </div>
          </div>
        </div>
        <div className="ch-a">
          {perms.isAdmin ? (
            <button type="button" className="btn" onClick={toggleSuspend} disabled={busy}>
              <UvIcon name={client.status === 'suspended' ? 'play' : 'pause'} />
              {client.status === 'suspended' ? 'Reactivar' : 'Suspender'}
            </button>
          ) : null}
          {perms.isAdmin ? (
            <button type="button" className="btn danger" onClick={() => setDeleteOpen(true)} disabled={busy}>
              <UvIcon name="trash" />Eliminar
            </button>
          ) : null}
        </div>
      </div>

      <div className="tabs ctabs">
        {tabs.map((t) => (
          <button type="button" key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ctab-b">
        {tab === 'datos' ? <DataTab client={client} onUpdated={replaceClient} /> : null}
        {tab === 'usuarios' ? <UsersTab tenantId={client.tenant_id} canEdit={perms.isAdmin} /> : null}
        {tab === 'agentes' ? <BotsTab tenantId={client.tenant_id} canEdit={perms.isAdmin} /> : null}
      </div>

      <ConfirmModal
        open={deleteOpen}
        title={`Eliminar a ${client.name}`}
        description="Se borran el tenant y los agentes clonados. No se puede deshacer."
        confirmLabel="Eliminar cliente"
        danger
        onConfirm={remove}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError('');
        }}
      >
        {deleteError ? <small className="lg-err">{deleteError}</small> : null}
      </ConfirmModal>
    </>
  );
}
