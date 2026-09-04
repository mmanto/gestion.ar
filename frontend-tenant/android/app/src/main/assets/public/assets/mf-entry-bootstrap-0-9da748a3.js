
const __mfCacheGlobalKey = "__mf_module_cache__";
globalThis[__mfCacheGlobalKey] ||= { share: {}, remote: {} };
globalThis[__mfCacheGlobalKey].share ||= {};
globalThis[__mfCacheGlobalKey].remote ||= {};
const __mfModuleCache = globalThis[__mfCacheGlobalKey];
for (const __mfShareKey of Object.keys(__mfModuleCache.share)) {
  if (__mfShareKey.startsWith("default:")) {
    const __mfLegacyShareKey = __mfShareKey.slice("default:".length);
    if (__mfModuleCache.share[__mfLegacyShareKey] === undefined) {
      __mfModuleCache.share[__mfLegacyShareKey] = __mfModuleCache.share[__mfShareKey];
    }
  } else if (!__mfShareKey.includes(":")) {
    const __mfDefaultShareKey = "default:" + __mfShareKey;
    if (__mfModuleCache.share[__mfDefaultShareKey] === undefined) {
      __mfModuleCache.share[__mfDefaultShareKey] = __mfModuleCache.share[__mfShareKey];
    }
  }
}

const __mfImport = (src) =>
  globalThis.System && typeof globalThis.System.import === 'function'
    ? globalThis.System.import(src)
    : import(src);


(async () => {
  const __mfHostInit = await __mfImport("./hostInit-B0zqyxQW.js");
  await __mfHostInit.__tla;
  const { initHost } = __mfHostInit;
  
  const runtime = await initHost();
  const __mfPreloadRemote = (runtimeRemote, remote) => {
    const remoteCacheKey = "virtual:mf:__mfe_internal__gestionar_mf_2_frontend_mf_2_tenant__mf_owner__1__mf_v__runtimeInit__mf_v__.js::" + remote;
    const pendingKey = "__mf_pending__" + remoteCacheKey;
    if (!__mfModuleCache.remote[pendingKey]) {
      __mfModuleCache.remote[pendingKey] = runtime.loadRemote(runtimeRemote)
        .then((mod) => {
          __mfModuleCache.remote[remoteCacheKey] = mod;
          delete __mfModuleCache.remote[pendingKey];
          return mod;
        })
        .catch((error) => {
          delete __mfModuleCache.remote[pendingKey];
          throw error;
        });
    }
    return __mfModuleCache.remote[pendingKey];
  };
  const __mfRemotePreloads = [__mfPreloadRemote("__mfe_internal__gestionar-frontend-tenant__mf_owner__1__appointments/AppointmentCalendarWidget", "appointments/AppointmentCalendarWidget"),__mfPreloadRemote("__mfe_internal__gestionar-frontend-tenant__mf_owner__1__appointments/AppointmentConfirmWidget", "appointments/AppointmentConfirmWidget"),__mfPreloadRemote("__mfe_internal__gestionar-frontend-tenant__mf_owner__1__appointments/AppointmentOptionsWidget", "appointments/AppointmentOptionsWidget"),__mfPreloadRemote("__mfe_internal__gestionar-frontend-tenant__mf_owner__1__appointments/AppointmentTimesWidget", "appointments/AppointmentTimesWidget")];
  await Promise.allSettled(__mfRemotePreloads);
  if (__mfModuleCache.pendingShareLoads) {
    await Promise.all(__mfModuleCache.pendingShareLoads);
  }
})().then(() => __mfImport("./index-CsSlD-HY.js"));
