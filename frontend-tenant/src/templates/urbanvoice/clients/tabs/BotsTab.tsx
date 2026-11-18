import { useCallback, useEffect, useState } from 'react';
import { useTenant } from '../../../../hooks/useTenant';
import partnerTenantsService from '../../../../services/partnerTenants.service';
import type { PartnerTenantBot, PartnerTenantBotModule } from '../../../../types/partnerTenant.types';
import { UvIcon } from '../../ui/UvIcon';
import { useToast } from '../../ui/Toast';

interface BotsTabProps {
  tenantId: string;
  canEdit: boolean;
}

interface BotWithModules {
  bot: PartnerTenantBot;
  modules: PartnerTenantBotModule[];
}

export default function BotsTab({ tenantId, canEdit }: BotsTabProps) {
  const { tenant } = useTenant();
  const { showToast } = useToast();
  const [bots, setBots] = useState<BotWithModules[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  /** Agentes del tenant base: si el cliente tiene 0, explican el porqué. */
  const [baseAgents, setBaseAgents] = useState<number | null>(null);
  const [cloning, setCloning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await partnerTenantsService.listBots(tenantId);
      // Los módulos son por agente: se resuelven después de tener la lista.
      const withModules = await Promise.all(
        list.map(async (bot) => ({
          bot,
          modules: await partnerTenantsService.listBotModules(tenantId, bot.bot_id),
        })),
      );
      setBots(withModules);
      setBaseAgents(
        list.length || !tenant?.tenant_id
          ? null
          : (await partnerTenantsService.listBots(tenant.tenant_id)).length,
      );
    } catch {
      setError('No se pudieron cargar los agentes.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, tenant?.tenant_id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (botId: string, module: PartnerTenantBotModule) => {
    const key = `${botId}:${module.module_key}`;
    if (savingKey) return;
    setSavingKey(key);
    try {
      const saved = await partnerTenantsService.setBotModuleEnabled(tenantId, botId, module.module_key, !module.enabled);
      setBots((list) =>
        list.map((entry) =>
          entry.bot.bot_id === botId
            ? {
                ...entry,
                modules: entry.modules.map((m) => (m.module_key === saved.module_key ? saved : m)),
              }
            : entry,
        ),
      );
    } catch {
      showToast(<>No se pudo cambiar <b>{module.module_name || module.module_key}</b></>);
    } finally {
      setSavingKey(null);
    }
  };

  const cloneAgents = async () => {
    if (cloning) return;
    setCloning(true);
    try {
      const cloned = await partnerTenantsService.cloneAgents(tenantId);
      showToast(<>{cloned === 1 ? 'Se clonó 1 agente' : `Se clonaron ${cloned} agentes`} de UrbanVoice</>);
      await load();
    } catch {
      showToast(<>No se pudieron clonar los agentes</>);
    } finally {
      setCloning(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="muted">Cargando agentes…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Agentes y módulos</h3>
      <p className="muted sm">
        Los agentes del cliente son una copia de los de UrbanVoice al momento del alta. Sólo se
        prenden o apagan los módulos ya otorgados.
      </p>

      {error ? <small className="lg-err">{error}</small> : null}

      {bots.length ? (
        bots.map(({ bot, modules }) => (
          <div key={bot.bot_id} style={{ marginTop: 18 }}>
            <div className="ch-b">
              <b>{bot.name}</b>
              <span className={`bdg ${bot.status === 'active' ? 'ok' : 'off'}`}>
                {bot.status === 'active' ? 'Activo' : bot.status}
              </span>
            </div>
            {bot.description ? <p className="muted sm">{bot.description}</p> : null}
            {modules.length ? (
              <div>
                {modules.map((module) => {
                  const key = `${bot.bot_id}:${module.module_key}`;
                  return (
                    <label className="ck" key={key} htmlFor={`mod-${key}`}>
                      <input
                        id={`mod-${key}`}
                        type="checkbox"
                        checked={module.enabled}
                        disabled={!canEdit || !module.available || savingKey === key}
                        onChange={() => toggle(bot.bot_id, module)}
                      />
                      {module.module_name || module.module_key}
                      {!module.available ? <small className="muted"> · no otorgado</small> : null}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="muted sm">Sin módulos cargados.</p>
            )}
          </div>
        ))
      ) : (
        <div className="empty">
          <UvIcon name="club" />
          <b>El cliente no tiene agentes</b>
          {baseAgents === null ? (
            <span>No se pudieron verificar los agentes de UrbanVoice.</span>
          ) : baseAgents === 0 ? (
            <span>
              UrbanVoice no tiene agentes configurados, por eso el cliente se creó sin agentes.
              Cuando los tenga, se pueden clonar desde acá.
            </span>
          ) : (
            <span>
              UrbanVoice tiene {baseAgents} {baseAgents === 1 ? 'agente' : 'agentes'} y este cliente
              se creó sin ellos.
            </span>
          )}
          {canEdit && baseAgents ? (
            <button type="button" className="btn pri sm" onClick={cloneAgents} disabled={cloning}>
              <UvIcon name="layers" />{cloning ? 'Clonando…' : 'Clonar agentes de UrbanVoice'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
