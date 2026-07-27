# DECISIONS.md — Architecture Decision Records (ADRs)

Registro de decisiones técnicas significativas con su contexto y razonamiento.
Una decisión documentada aquí no debe cuestionarse sin agregar un nuevo ADR.

---

## Formato de ADR

```
## ADR-XXX: Título
**Estado:** Propuesto | Aceptado | Obsoleto | Reemplazado por ADR-YYY
**Fecha:** YYYY-MM-DD

### Contexto
¿Qué problema motiva esta decisión?

### Opciones consideradas
1. Opción A — ventajas / desventajas
2. Opción B — ventajas / desventajas

### Decisión
Opción elegida y motivo.

### Consecuencias
Qué implica esta decisión a futuro.
```

---

## ADR-001: Claude API como proveedor LLM principal (con Ollama como alternativa)

**Estado:** Aceptado

### Contexto
El sistema necesita un LLM para generar respuestas conversacionales. La elección impacta directamente en los costos de infraestructura, la calidad de respuestas y la complejidad operativa.

### Opciones consideradas
1. **Claude API (Anthropic)** — Cloud, pay-as-you-go, sin infraestructura de GPU, alta calidad en español, context window de 200K tokens
2. **Ollama local** — Self-hosted, costo fijo de infraestructura, requiere VPS con 8GB+ RAM, modelos menores en calidad

### Decisión
Claude API como proveedor por defecto (`LLM_PROVIDER=claude`). Se mantiene Ollama como alternativa configurable para escenarios con requisitos estrictos de privacidad o alto volumen donde el costo de API supere el costo de infraestructura (~$40+/mes).

### Consecuencias
- VPS mínimo: 4GB RAM (vs 8GB con Ollama)
- Costo variable: ~$1-20/mes según volumen (vs costo fijo del servidor más potente)
- Latencia predecible: ~1-2s por respuesta
- Proveedor intercambiable via `get_llm_service()` en `app/claude_service.py`
- Migrar a Ollama cuando: costos API > $40/mes consistentemente, o requisitos de privacidad que impidan datos externos

---

## ADR-002: MongoDB como base de datos principal (no PostgreSQL)

**Estado:** Reemplazado por ADR-006

### Contexto
El dominio del proyecto (bots, conversaciones, configuraciones de canales) tiene esquemas semi-estructurados que varían por tipo de canal y configuración de bot. PostgreSQL con migraciones rigurosas añadiría fricción innecesaria para este tipo de datos.

### Opciones consideradas
1. **MongoDB** — Documentos JSON flexibles, schema-less, Motor async, fácil de cambiar modelos
2. **PostgreSQL** — Relacional, tipado estricto, Alembic migrations, joins nativos

### Decisión
MongoDB. Los modelos Pydantic proveen validación en capa de aplicación. La flexibilidad del documento JSON es ventajosa para `BotConfig`, `ChannelConfig` y `metadata` de conversaciones que varían por canal.

### Consecuencias
- No hay migraciones Alembic: los cambios de schema se manejan en el código Python
- Motor (driver async) para todas las queries
- Sin foreign keys nativas: consistencia referencial en capa de servicio
- Índices creados explícitamente al startup (`ensure_indexes()`)

---

## ADR-003: ChromaDB para vector store RAG

**Estado:** Aceptado

### Contexto
El sistema RAG necesita un vector store para almacenar y buscar embeddings de documentos.

### Opciones consideradas
1. **ChromaDB** — Open-source, embebido (sin servidor adicional), persistente en disco, <100MB RAM
2. **Pinecone** — Managed, hosted, costo adicional, sin infraestructura
3. **pgvector** — PostgreSQL extension, requiere PostgreSQL (incompatible con ADR-002)
4. **Weaviate** — Más potente pero más complejo de operar

### Decisión
ChromaDB persistente en volumen Docker. Suficiente para <100K chunks, no requiere servidor separado, fácil de operar en VPS con 4GB RAM.

### Consecuencias
- Volume Docker `chroma_data` para persistencia
- Modelo de embeddings: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384 dims, multiidioma, <500MB RAM)
- `CHROMA_PATH=/app/chroma_db` en variables de entorno
- Migrar a Pinecone o Weaviate cuando: >100K documentos, búsqueda distribuida, o multi-tenancy por bot

---

## ADR-004: Arquitectura multi-canal con routers separados por proveedor

**Estado:** Aceptado

### Contexto
El sistema soporta múltiples canales de mensajería (WhatsApp Meta, WhatsApp Twilio, Telegram, Web, PWA) cada uno con su protocolo de webhook, verificación y formato de mensajes.

### Opciones consideradas
1. **Router unificado** — Un solo webhook que detecta el canal por headers o body
2. **Routers separados por canal/proveedor** — Un router por canal con URL única

### Decisión
Routers separados: `whatsapp_webhook_router.py` (con sub-rutas por proveedor), `telegram_webhook_router.py`, `web_chat_router.py`, `pwa_router.py`. Cada canal tiene su URL única que incluye el `channel_id`.

URLs de webhook:
- WhatsApp Meta: `/api/webhook/whatsapp/meta/{channel_id}`
- WhatsApp Twilio: `/api/webhook/whatsapp/twilio/{channel_id}`
- Telegram: `/api/webhook/telegram/{channel_id}`

### Consecuencias
- La URL del webhook incluye el `channel_id`, permitiendo multi-tenancy (múltiples canales del mismo tipo)
- Fácil agregar nuevos proveedores sin tocar lógica existente
- El `channel_id` debe incluirse en la configuración del webhook en cada plataforma

---

## ADR-005: Knowledge base global (compartida entre todos los bots)

**Estado:** Resuelto (ver sección "Resolución")

### Contexto
Los documentos indexados en ChromaDB eran compartidos entre todos los bots. No había segmentación por `bot_id` en la knowledge base, ni en la ingesta ni en el retrieval, y varios endpoints de administración (`/api/rag/*`) ni siquiera requerían autenticación.

### Consecuencias (antes de la resolución)
- Todos los bots podían acceder al mismo conocimiento
- No había aislamiento de datos entre bots de diferentes propietarios
- El entrenamiento por agente (`system_prompt`/`ius_config`) tampoco se aplicaba en WhatsApp ni Telegram (usaban un prompt genérico hardcodeado), aunque sí estaba correctamente aislado por `bot_id` en MongoDB

### Resolución
- Se agregó `bot_id` a la metadata de cada chunk en ChromaDB (una sola colección, sin colecciones por bot). `RAGService.search`/`get_context`/`list_documents`/`delete_document` ahora requieren `bot_id` y lo aplican como filtro `where` (ver `DATA_MODEL.md`).
- Se eliminó el campo vestigial `Bot.knowledge_base_id` (nunca se llegó a usar).
- Los endpoints de documentos se movieron de `/api/documents/*` y `/api/rag/*` (globales, algunos sin autenticación) a `/api/bots/{bot_id}/documents/*`, con autenticación + verificación de ownership (mismo patrón que `appointments_router.py`).
- Se corrigió que WhatsApp y Telegram ignoraran `system_prompt`/`ius_config`: ahora ambos canales cargan el bot y aplican `build_effective_system_prompt(bot.config)` igual que el canal Web.
- Los documentos existentes (sin `bot_id`, mezclados) se wipearon manualmente (`backend/scripts/wipe_knowledge_base.py`) en el mismo deploy que este fix.
- Los endpoints legacy pre-multi-tenant `/api/chat` y `/api/webhook` (WhatsApp) quedaron deprecados (410 Gone). `/api/webhook/telegram` (sin `channel_id`) se mantuvo activo porque hay un bot de Telegram real apuntando ahí para pruebas; ahora resuelve su `bot_id` buscando un canal cuyo `telegram_config.bot_token` coincida (`ChannelService.get_channel_by_telegram_token`), para poder aplicar RAG y entrenamiento propios cuando corresponda.

---

## ADR-006: PostgreSQL como base de datos principal (reemplaza ADR-002)

**Estado:** Aceptado

### Contexto

ADR-002 rechazó PostgreSQL por la flexibilidad de esquema que requerían `BotConfig`/`ChannelConfig`/`metadata` de conversaciones. Un análisis de viabilidad posterior (con el proyecto ya en producción, ~100MB de datos, 10-50 usuarios/día) encontró que ese argumento sigue siendo válido únicamente para `bots.config` y `channels.*_config` (dominio en desarrollo activo: `FlowConfig`, `ius_config`), pero **no aplica** al resto del modelo: `users`, `clients`, `push_subscriptions` y `conversations` siempre fueron datos planos modelados en Mongo por conveniencia de stack único, no por necesidad real de esquema flexible. Además:

- `conversations.messages` es un array que crece indefinidamente vía `$push`, sin índices propios — una debilidad de modelado real, independiente de la base de datos elegida.
- Mongo no valida integridad referencial (`bot_id`, `client_id` sueltos sin FK), lo cual ya generó la necesidad de "joins en código de aplicación" en varios servicios.
- Los proyectos hermanos del mismo workspace (`devbout-appointments`, `nexsure/insurance-api`) ya usan PostgreSQL + SQLAlchemy + Alembic + asyncpg — mantener MongoDB en gestion.ar duplica stack, conocimiento operativo y backups sin necesidad.

### Opciones consideradas

1. **Mantener MongoDB** — sin fricción de migraciones, pero perpetúa la falta de índices en conversaciones, la ausencia de integridad referencial y un stack de datos distinto al resto de la organización.
2. **Migración parcial permanente** (solo lo ya-relacional a Postgres, dejando `bots`/`channels` en Mongo indefinidamente) — resuelve lo urgente pero dos bases de datos para siempre no es una arquitectura objetivo razonable para un proyecto de este tamaño.
3. **Migración total a PostgreSQL con esquema híbrido** — columnas tipadas donde el dominio ya es estable, `JSONB` donde sigue siendo inestable (`bots.config`, `channels.*_config`). Preserva la velocidad de iteración que motivó ADR-002 sin mantener dos motores de base de datos.

### Decisión

Opción 3: migración total a PostgreSQL, con `JSONB` para los campos de configuración que siguen en desarrollo activo (`BotConfig` completo, `*_config` por tipo de canal, `metadata` libre), y columnas tipadas + foreign keys para todo lo demás. El array embebido `conversations.messages` se normaliza a una tabla hija `messages` con FK a `conversations` — es la única normalización estructural real de esta migración.

La migración se ejecuta en fases separadas: esta decisión y el setup de infraestructura (SQLAlchemy + Alembic + Postgres en paralelo a Mongo) son la fase inicial; la reescritura de los servicios (`bot_service.py`, `client_service.py`, `channel_service.py`, `user_service.py`, `push_service.py`, `conversation_service.py`) y la migración de datos reales quedan para un trabajo posterior, servicio por servicio, de menor a mayor riesgo.

### Consecuencias

- Se adoptan migraciones Alembic versionadas — deja de aplicar "no hay migraciones, los cambios de schema se manejan en código" (consecuencia de ADR-002).
- SQLAlchemy + asyncpg como driver async, siguiendo la misma convención que `devbout-appointments`/`nexsure/insurance-api`.
- Los campos `config`/`*_config`/`metadata` siguen siendo JSON libre (columnas `JSONB`), sin forzar tipado rígido — no se pierde la flexibilidad que motivó ADR-002 originalmente para esos campos puntuales.
- Se ganan foreign keys nativas (`bot_id`, `client_id`, `channel_id`) — la consistencia referencial deja de depender exclusivamente de la capa de servicio.
- Requiere una ventana de mantenimiento corta para la migración de datos real (fuera de esta fase), dado el bajo volumen (~100MB) y tráfico (10-50 usuarios/día).
- Mongo se mantiene corriendo en paralelo durante la transición (fase de infraestructura) y se apaga recién cuando todos los servicios estén migrados y validados.

### Cierre (2026-07-04)

Migración completa. Los 6 servicios (`user_service.py`, `bot_service.py`, `channel_service.py`, `client_service.py`, `push_service.py`, `conversation_service.py`) fueron reescritos a SQLAlchemy/Postgres y verificados funcionalmente contra el stack real, uno por uno, en orden de dependencia FK real (`users → bots → channels → clients/push_subscriptions → conversations+messages` — distinto al orden de riesgo estimado originalmente, reordenado dos veces durante la ejecución al descubrir bloqueos de FK concretos). Cada incremento tuvo su propio script de datos idempotente en `backend/scripts/migrate_*_to_postgres.py` (quedan como referencia histórica del proceso, ya no se pueden re-ejecutar una vez apagado Mongo).

De paso se corrigieron varios bugs reales encontrados durante la reescritura (no relacionados con la elección de base de datos, sino con la lógica original): falsos negativos idempotentes en `activate_channel`/`delete_bot`/`block_client`/`deactivate_subscription` (devolvían error si el recurso ya estaba en el estado deseado), un `pwa_config` que se perdía en silencio al crear canales, y `get_conversation_stats.total_messages` que no filtraba por `bot_ids` (mostraba el conteo global de todos los owners en un endpoint scoped por owner).

Mongo fue desconectado de `docker-compose.yml` (servicio, env var `MONGODB_URI`, dependencia `motor` en `requirements.txt`) pero el volumen de datos se conserva sin borrar como red de rollback, a criterio del equipo cuándo eliminarlo definitivamente. El esquema relacional final está documentado en `docs/dev/DATA_MODEL.md`.


---

## ADR-007: Capacitor como estrategia mobile (no React Native)

**Estado:** Aceptado
**Fecha:** 2026-07-13

### Contexto

El proyecto requiere dos experiencias mobile diferenciadas:

1. **Staff App:** admins y operadores del tenant necesitan gestionar bots, ver clientes,
   revisar conversaciones, y chatear en tiempo real con prospectos desde el teléfono.
2. **Client App:** los prospectos y clientes finales necesitan chatear con el bot/agente y
   recibir notificaciones push, idealmente distribuible en App Store y Play Store.

El PWA (`frontend-tenant/`) ya implementa ~15 pantallas en React + Vite + Tailwind,
incluyendo un chat WebSocket funcional, push notifications VAPID, y un portal de cliente.
No hay código nativo móvil alguno.

### Opciones consideradas

1. **Capacitor** — Wrapper nativo que empaqueta el código React existente como app iOS/Android.
   Mismo codebase para PWA + Android + iOS. Acceso a APIs nativas (push FCM/APNs, deep links,
   secure storage, status bar) vía plugins oficiales. Cero duplicación de lógica.
2. **React Native (Expo)** — App nativa real con componentes de UI nativos. Requiere reescribir
   todas las pantallas y componentes (las 15 páginas actuales + ~30 componentes). Dos codebases
   divergentes (PWA web + RN mobile) para mantener.
3. **Flutter** — Mismo problema que RN pero en Dart: reescritura total, stack distinto al del equipo.

### Decisión

**Capacitor.** Una sola base de código (`frontend-tenant/`) genera tres artefactos:
PWA (web), APK/AAB (Android), IPA (iOS). Dos targets de build (`staff` y `client`)
desde el mismo monorepo, compartiendo componentes, hooks, servicios y lógica de negocio.

Razones:
- Las 15 pantallas y ~30 componentes ya existen y funcionan. Tirarlos para reescribir
  en RN o Flutter es ~3-6 meses de trabajo sin valor incremental para el negocio.
- Capacitor se integra con el toolchain existente (Vite + React + Tailwind) sin cambios.
- Los plugins de Capacitor (Push Notifications, StatusBar, SplashScreen, Keyboard,
  App, Haptics) cubren el 100% de lo que necesitan ambas apps.
- La PWA sigue funcionando como está para quienes no instalen la app nativa.

### Consecuencias

- **Monorepo único:** `frontend-tenant/` aloja ambos targets. Se usa `VITE_TARGET=staff|client`
  para condicionar rutas, shells de navegación y features por build.
- **Push notifications:** se agrega FCM (Android) + APNs (iOS) al backend como transporte
  adicional. VAPID se mantiene para la PWA web. `push_service.py` se extiende con un
  router de transporte por tipo de suscripción (`fcm`, `apns`, `vapid`).
- **WebSocket:** el staff usa el mismo `/ws/chat/channel/{channel_id}` para recibir
  mensajes en tiempo real. El backend debe forwardear mensajes de cliente a los
  operadores conectados y notificar vía push a los que están offline.
- **Build y distribución:** dos `capacitor.config.ts` (staff/client), cada uno con su
  propio bundle ID. CI/CD genera ambos APK/IPA desde el mismo `npm run build`.
- **Seguridad:** JWT almacenado en Capacitor Secure Storage (Keychain/Keystore),
  no en localStorage.
- Las stats de `bot_service.py` (`total_clients`, `total_conversations`, `total_messages`)
  no tienen lógica que las incremente — esto es deuda existente, no bloqueante para mobile.

---

## ADR-008: Arquitectura de módulos/plugins (manifiesto + dos tiers de confianza)

**Estado:** Aceptado
**Fecha:** 2026-07-21

### Contexto

"Módulos" (`rag`, `lead_funnel`, `appointments`) son hoy solo una capa de
entitlement en base de datos (`modules` + `bot_modules`,
`backend/app/services/module_service.py`) — el propio docstring de `Module`
en `backend/app/db/models.py` lo admite: la modularización real del código
sigue siendo trabajo futuro.

Problemas concretos del estado actual:
- `backend/app/main.py` registra todos los routers de todos los módulos
  siempre (`include_router` incondicional). El gating pasa a mano dentro de
  cada service (`is_enabled()` llamado en puntos sueltos), y es
  inconsistente: `appointments_router` (CRUD admin) no chequea `is_enabled`
  en absoluto, y `rag` no parece chequearse en ningún lado.
- El backend de `appointments` (`backend/app/integrations/appointments_client.py`,
  adapter HTTP hacia el microservicio externo `devbout-appointments`, con
  router propio, webhook con verificación HMAC, modelos propios) está
  razonablemente bien desacoplado — es, sin haberlo buscado, el ejemplo más
  maduro de "módulo" que existe hoy.
- El frontend es donde se rompe la abstracción: `ChatInterface.tsx`
  (duplicado casi al pixel entre `frontend/src` y `frontend-tenant/src`)
  importa y hardcodea `AppointmentCalendarWidget`/`AppointmentTimesWidget`/
  `AppointmentConfirmWidget` directamente en el componente de chat genérico
  que usa todo bot, tenga o no el módulo habilitado. No existe ningún
  `useModules()`/`ModuleGate` en el frontend — la ruta admin
  `/bots/:botId/appointments` tampoco tiene guard de módulo (solo rol
  `super_admin`).
- Planes y módulos están completamente desconectados: `Tenant.plan_id` no
  tiene relación con qué módulos están disponibles; el otorgamiento es 100%
  manual por bot (`grant_module`).

Alcance definido para la nueva arquitectura: los módulos eventualmente los
va a poder construir un tercero (modelo marketplace, tipo Shopify Apps/Slack
Apps), cada módulo necesita poder deployarse/actualizarse
independientemente del resto de la app, y el plan de un tenant debe
determinar qué módulos tiene disponibles por defecto (el otorgamiento
manual queda como override puntual).

### Opciones consideradas

**Backend** (cómo se empaqueta y aísla la lógica de un módulo):
1. **Registro in-process** (Python, código del módulo corre en el mismo
   proceso FastAPI) — sin aislamiento real, sin deploy independiente, no
   apto para terceros sin sandboxing. Costo bajo.
2. **Servicio externo + adapter/webhook** (lo que `appointments` ya hace) —
   aislamiento total de proceso/deploy/fallo, deploy independiente nativo,
   apto para terceros (modelo "app" de Shopify/Slack: tu servidor, su API).
   Costo medio (adapter + contrato + auth).
3. **Sandboxing en-proceso** (subinterpreters, WASM, gVisor) — aislamiento
   parcial, alta complejidad de infraestructura de plataforma.

**Frontend** (cómo se extiende nav, páginas admin, widgets de chat):
1. **Import estático + registro** — resuelve el hardcoding de
   `ChatInterface.tsx` pero no deploy independiente ni terceros.
2. **Module Federation** (Vite/Rollup, remotes en runtime) — deploy
   independiente, buen DX, pero aislamiento bajo (mismo JS realm/origen) —
   solo apto para módulos confiables.
3. **iframe + postMessage** (Salesforce LWC, Shopify App Bridge, plugins de
   Figma) — aislamiento alto (proceso/realm separado), estándar real para
   frontend de terceros, con fricción de UX (tamaño, theming, latencia)
   mitigable con un SDK de postMessage bien diseñado.
4. **Web Components remotos** — aislamiento medio (Shadow DOM, mismo
   realm), punto medio combinable con iframe como fallback no-verificado.

### Decisión

**Manifiesto de módulo versionado + dos tiers de confianza**, reemplazando
el catálogo estático `modules`:

```
module_key, version, trust_tier: "first_party" | "verified" | "third_party"
backend: base_url, webhook_url, scopes[]
frontend: remote_entry_url, extension_points[]  # ej. "chat.widget.appointment_calendar", "admin.nav"
```

- **Backend** — un Module Registry reemplaza el `include_router`
  incondicional de `main.py`: itera el manifiesto de los módulos
  habilitados (derivado de `plan.included_module_keys` ∪ `BotModule.granted`
  como override) y, según `trust_tier`, wirea código in-repo (`first_party`)
  o llama a un cliente HTTP genérico —el mismo patrón de
  `AppointmentsClient`, generalizado— para `verified`/`third_party`, sin
  importar nunca código de terceros al proceso.
- **Frontend** — un Extension Point Registry (`registerExtension(point, loader)`)
  reemplaza los imports hardcodeados de `ChatInterface.tsx`; el loader detrás
  de cada extension point es Module Federation para `first_party` (mismo
  framework, buena integración visual) o iframe sandboxeado + SDK de
  postMessage para `third_party` — mismo extension point, loader distinto.
- **Planes → módulos** — se agrega `plan_modules` (o `plans.included_module_keys`);
  el módulo está disponible si `module_key ∈ plan.included_module_keys OR
  BotModule.granted = true`. `grant_module`/`revoke_module` pasan a ser
  explícitamente overrides sobre lo que da el plan.

Se elige este enfoque en vez de construir directamente el camino
`third_party` completo porque hoy solo existe `appointments` como módulo
real, y es `first_party`: la migración inicial prueba el patrón completo
(manifiesto + registry backend + registry frontend) con ese único caso,
dejando el loader `iframe`/`third_party` para cuando aparezca el primer
módulo externo real, sobre el mismo registry, sin rediseñarlo.

### Consecuencias

- Requiere migración de datos: `plan_modules` + backfill desde el estado
  actual de `bot_modules` para no perder los grants ya otorgados.
- `backend/app/main.py` deja de tener líneas `include_router` hardcodeadas
  para módulos — todo debe salir del registro leyendo manifiesto +
  entitlement.
- `ChatInterface.tsx` (las dos copias, en `frontend/src` y
  `frontend-tenant/src`) se migra al Extension Point Registry — con
  code-splitting, un bot con `appointments` deshabilitado no debe descargar
  el bundle de esos widgets.
- El SDK de postMessage/iframe para `third_party` se diseña recién cuando
  haya un candidato real a módulo externo — no se construye especulativamente
  ahora.
- Implementación pendiente, en este orden: migración `plan_modules` con
  backfill → Module Registry backend (piloteado con `appointments`) →
  Extension Point Registry frontend + migración de `ChatInterface.tsx` →
  recién ahí, SDK `third_party`. Cada paso requiere su propio plan de
  implementación (no está detallado en este ADR).

---

## ADR-009: Frontend de turnos vía Module Federation (devbout-appointments)

**Estado:** Aceptado
**Fecha:** 2026-07-22

### Contexto

ADR-008 dejó `appointments` como el caso piloto de módulo `first_party`,
pero el desacople logrado hasta ahora es solo de backend:
`devbout-appointments` es un microservicio Python puro (sin una sola línea
de frontend — no tiene `package.json` ni `vite.config` en el repo),
mientras que toda la UI de turnos vive hardcodeada en `gestion.ar`:

- Chat del cliente final: `frontend/src/components/chat/
  {AppointmentCalendarWidget,AppointmentTimesWidget,AppointmentConfirmWidget}.tsx`,
  duplicados letra por letra en `frontend-tenant/src/components/chat/`.
- Panel admin: `frontend/src/pages/BotAppointments.tsx` +
  `frontend/src/components/appointments/{ResourcesTab,ServicesTab,
  AvailabilityTab,AppointmentsTab,AppointmentsConfigBanner}.tsx` (no existe
  equivalente en `frontend-tenant`, que solo tiene los widgets de chat).

Mientras el código de UI viva ahí, `appointments` no es un módulo real: no
se puede deployar ni versionar independientemente de `gestion.ar`, y el
patrón que ADR-008 promete para futuros módulos de terceros queda sin
probar del lado frontend.

### Opciones consideradas

1. **Paquete npm versionado** — mover los componentes a un paquete
   publicado desde `devbout-appointments`, `gestion.ar` lo instala como
   dependencia normal. Simple, pero sigue siendo el mismo bundle final —
   separa el código fuente, no da deploy independiente en runtime.
2. **Module Federation (Vite)** — `devbout-appointments` sirve su propio
   build con remotes expuestos; `gestion.ar` los carga en runtime. Deploy
   independiente real, buen DX, pero acopla versión de React/framework
   entre ambos repos y sigue siendo el mismo JS realm (no aislamiento de
   proceso, solo independencia de deploy).
3. **iframe + SDK de postMessage** — aislamiento total (proceso/realm
   separado, hasta otro framework posible), el modelo "app" real tipo
   Shopify/Salesforce. ADR-008 ya reservó este loader explícitamente para
   el primer módulo `third_party` real — usarlo acá para `appointments`
   (que es `first_party`, mismo equipo, confianza total) sería construir
   la fricción de UX y el SDK de forma especulativa, sin necesidad.

### Decisión

**Module Federation**, con `@module-federation/vite` (no
`@originjs/vite-plugin-federation` — roto contra Vite 7 según
[originjs/vite-plugin-federation#732](https://github.com/originjs/vite-plugin-federation/issues/732),
sin mantenimiento activo hace un año; `frontend`/`frontend-tenant` corren
Vite `^7.2.4`, y `@module-federation/vite` sí declara soporte explícito
Vite 5/6/7/8).

Diseño de acoplamiento, resuelto por pieza según su dependencia real del
host:

- **Chat widgets** (`AppointmentCalendarWidget`/`Times`/`Confirm`): hoy son
  puramente presentacionales (props + callbacks, sin fetch propio, sin
  imports del design system). Se exponen tal cual — solo `react` y
  `date-fns` (`^4.1.0` en ambos frontends) como `shared`.
- **Panel admin**: depende de 3 piezas del design system de `gestion.ar`
  (`Input`/`Button`/`Card`) y de `react-router-dom`. Se resuelve por
  **inyección de props**, no duplicación ni federación del design system:
  el remote recibe `ui={{ Input, Button, Card }}` desde `BotAppointments.tsx`,
  sin importar nada del host directamente. Es lo correcto para un módulo
  que algún día podría ser de un tercero real (no puede asumir que existe
  un DS del host), a costa de refactorizar los 5 componentes para tomar
  esas 3 piezas por props en vez de import directo. Mismo criterio para el
  cliente HTTP: se inyecta `apiClient` (instancia ya configurada, con su
  interceptor de 401) en vez de que el remote importe `services/api.ts`
  del host. El color de acento (`useAccentTheme()`) se pasa como prop
  simple (`accent: string`), no se federa el hook.
- **Extension Point Registry** (`registerExtension`/`ExtensionSlot`) de
  ADR-008: no se construye todavía. Wiring directo —
  `lazy(() => import('appointments/AppointmentCalendarWidget'))` apuntando
  al remote — mismo criterio que ADR-008 usó para descartar el
  iframe/third-party especulativo. El registry genérico se construye
  cuando aparezca un segundo módulo real que lo necesite.
- **Fasado**: chat widgets primero (menor riesgo, cero acoplamiento a
  DS/API, valida todo el pipeline nuevo — primer Node/JS en
  `devbout-appointments`, primer static-hosting con CORS en ese repo,
  primer router de Traefik cross-repo, compatibilidad real de
  `@module-federation/vite` con Vite 7.2.4 en este monorepo). Panel admin
  (con el contrato de inyección de `ui`/`apiClient`) recién con esa
  infraestructura ya probada en producción.

### Consecuencias

- `devbout-appointments` gana su primer frontend (`frontend-widgets/`,
  Vite + React 19, mismas versiones que `gestion.ar` para que el singleton
  sharing de Module Federation dedupe de verdad) y su primer
  static-hosting con CORS — hasta ahora el repo era 100% Python/FastAPI.
- `devbout-appointments` no tiene tags de git ni CI hoy — versionar el
  `remoteEntry.js` de forma independiente del deploy de `gestion.ar`
  requiere establecer esa convención desde cero (queda detallado en el
  plan de implementación, no en este ADR).
- `frontend/src/components/chat/Appointment*Widget.tsx` y
  `frontend/src/components/appointments/*` (y sus duplicados en
  `frontend-tenant/`) se eliminan de `gestion.ar` una vez migrados y
  verificados — el código fuente vive en un solo lugar (`devbout-appointments`),
  no en dos repos a la vez.
- Cualquier cambio de contrato de props (`ui`, `apiClient`, `accent`,
  shape de `AppointmentWidget`) entre el remote y `gestion.ar` no rompe en
  build-time (son dos builds separados) — solo en runtime. Mismo trade-off
  ya señalado para el cliente HTTP `devbout-appointments`↔`gestion.ar`
  backend en ADR-008.