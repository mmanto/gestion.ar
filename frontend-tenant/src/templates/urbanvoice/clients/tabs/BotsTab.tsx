import { useEffect, useState } from 'react';
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
  const { showToast } = useToast();
  const [bots, setBots] = useState<BotWithModules[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    partnerTenantsService
      .listBots(tenantId)
      .then(async (list) => {
        // Los módulos son por agente: se resuelven después de tener la lista.
        const withModules = await Promise.all(
          list.map(async (bot) => ({
            bot,
            modules: await partnerTenantsService.listBotModules(tenantId, bot.bot_id),
          })),
        );
        if (!cancelled) setBots(withModules);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar los agentes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

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
        Los agentes se clonaron de UrbanVoice. Sólo se prenden o apagan los módulos ya otorgados.
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
          <span>El agente se clona del tenant base al dar de alta el cliente.</span>
        </div>
      )}
    </div>
  );
}
