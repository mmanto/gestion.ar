import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Spinner } from '../components/common/Spinner';
import tenantAdminService from '../services/tenantAdmin.service';
import type { BotModuleInfo } from '../types/tenant.types';
import { useModule } from './ModulesProvider';

/**
 * Guard genérico de las pantallas de módulo: resuelve si el módulo está
 * disponible (otorgado o incluido en el plan del tenant) para el bot de la
 * ruta y monta la pantalla con su `BotModuleInfo` ya resuelto.
 */
export function ModuleGate({ moduleKey, children }: { moduleKey: string; children: (info: BotModuleInfo) => ReactNode }) {
  const { botId } = useParams<{ botId: string }>();
  const manifest = useModule(moduleKey);
  const [state, setState] = useState<{ loading: boolean; info: BotModuleInfo | null }>({
    loading: true,
    info: null,
  });

  useEffect(() => {
    if (!botId) return;
    let cancelled = false;
    setState({ loading: true, info: null });
    tenantAdminService
      .getBotModules(botId)
      .then((mods) => {
        if (cancelled) return;
        setState({ loading: false, info: mods.find((m) => m.module_key === moduleKey) ?? null });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, info: null });
      });
    return () => {
      cancelled = true;
    };
  }, [botId, moduleKey]);

  const moduleName = manifest?.name ?? moduleKey;

  if (state.loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      </AppLayout>
    );
  }

  if (!state.info?.available) {
    return (
      <AppLayout>
        <div className="flex flex-col gap-4">
          <nav className="mb-4">
            <ol className="flex items-center space-x-2 text-base text-gray-900">
              <li>
                <Link to="/bots" className="hover:underline text-foreground">
                  Agentes
                </Link>
              </li>
              <li>/</li>
              <li>
                <Link to={`/bots/${botId}`} className="hover:underline text-foreground">
                  Agente
                </Link>
              </li>
              <li>/</li>
              <li className="text-gray-900">{moduleName}</li>
            </ol>
          </nav>

          <PageHeader title={moduleName} description={manifest?.description} />

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              El módulo <strong>{moduleName}</strong> no está disponible para este agente (ni
              otorgado ni incluido en el plan del tenant). Otorgalo desde el detalle del agente, o
              agregalo al plan del tenant, para poder configurarlo acá.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return <>{children(state.info)}</>;
}
