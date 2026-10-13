import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchModuleManifest, type ModuleManifest } from './manifest';

interface ModulesContextValue {
  modules: ModuleManifest[];
  loading: boolean;
  error: string | null;
}

const ModulesContext = createContext<ModulesContextValue>({
  modules: [],
  loading: true,
  error: null,
});

/**
 * Carga el manifiesto de módulos instalados una sola vez y lo expone a la app:
 * navegación, rutas y widgets de chat se derivan de ahí (más el registry de
 * componentes, ver `registry.tsx` / `chatWidgets.tsx`) en vez de estar
 * hardcodeados por pantalla.
 */
export function ModulesProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<ModuleManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModuleManifest()
      .then((mods) => {
        if (!cancelled) setModules(mods);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el manifiesto de módulos');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ModulesContext.Provider value={{ modules, loading, error }}>{children}</ModulesContext.Provider>
  );
}

export function useModulesState(): ModulesContextValue {
  return useContext(ModulesContext);
}

export function useModules(): ModuleManifest[] {
  return useContext(ModulesContext).modules;
}

export function useModule(moduleKey: string): ModuleManifest | undefined {
  return useContext(ModulesContext).modules.find((m) => m.module_key === moduleKey);
}
