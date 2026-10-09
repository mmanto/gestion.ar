# ADR-026: registrar la evaluación de LangGraph y la decisión de no incorporarlo

## Contexto

Se pidió analizar pros y contras de incorporar LangGraph (orquestación de agentes) a este backend. El
análisis ya está hecho: arquitectura leída con `file:line` y requisitos de dependencias verificados leyendo
el `METADATA` de los wheels publicados en PyPI (no de memoria ni de la documentación). La decisión es **no
incorporarlo ahora** y dejar disparadores explícitos que la revisen.

El repo exige que toda decisión técnica relevante quede en `docs/dev/DECISIONS.md` (fila "Decisión técnica
relevante (ADR)" del mapa de `AGENTS.md`) y que un ADR emitido no se cuestione sin agregar otro.
Resultado final: `docs/dev/DECISIONS.md` contiene ADR-026 con la evaluación, la decisión y sus consecuencias.
Sin cambios de código, sin cambios de dependencias, sin cambios de comportamiento.

## Approach

### Paso 1 — Agregar ADR-026 al final de `docs/dev/DECISIONS.md`

- Archivo: `docs/dev/DECISIONS.md`, hoy 1625 líneas. El último ADR es ADR-025 ("Las definiciones D1–D4 del
  semáforo se aplican como respuestas operativas"), cuya sección `### Consecuencias` termina en la línea 1625.
- Acción: **append al final del archivo**, con el bloque insertado separado del contenido existente por una
  línea en blanco + `---` + una línea en blanco (el bloque de abajo ya arranca con el `---`). No reordenar,
  renumerar ni reformatear nada de lo existente.
- Numeración: 026 es el siguiente libre (el archivo tiene ADR-001..ADR-025 más la plantilla `## ADR-XXX`).
- Formato: el de este repo, **sin** campo `Autores` (la plantilla de `docs/dev/DECISIONS.md:8-27` declara
  solo `**Estado:**` y `**Fecha:**`; ADR-025 en `:1573-1580` es el ejemplo a copiar).

### Paso 2 — Bloque a insertar (texto literal)

````markdown
---

## ADR-026: LangGraph no se incorpora al backend (evaluación y disparadores)

**Estado:** Aceptado
**Fecha:** 2026-09-28

### Contexto

El runtime conversacional se orquesta a mano. Cada provider LLM implementa su propio loop de tool calling
(Claude en `backend/app/claude_service.py:242`, DeepSeek en `backend/app/deepseek_service.py:105`, ambos con
tope de 3 vueltas y una llamada final forzada sin tools); Ollama no soporta tool calling
(`backend/app/ollama_service.py:43`). El estado del turno vive en memoria del worker y atado a la conexión
WebSocket: `conversation_history` en `backend/app/routers/web_chat_router.py:239`, `BookingState` en
`backend/app/services/appointment_booking_service.py:168` y `FlowState` en
`backend/app/services/conversation_flow_service.py:49`. El historial persistido en Postgres
(`conversations`/`messages`, `backend/app/conversation_service.py`) nunca se rehidrata al prompt: WhatsApp
(`backend/app/routers/whatsapp_webhook_router.py:93`) y Telegram (`backend/app/telegram_handlers.py:215`)
llaman al LLM sin historial, así que cada mensaje es un turno suelto.

La decisión de negocio del bot IUS (semáforo legal) se toma dentro del LLM: el JSON completo de
`bot.config.ius_config` se inyecta como system prompt en cada turno
(`backend/app/claude_service.py:408-461`) — 63.510 bytes compactos, ~16k tokens — y el modelo recorre a mano
las 33 reglas de `priority.reglas`; el color solo llega a Python por tool calling
(`backend/app/services/prospect_auto_qualify_service.py:29-123`). La medición vigente de ese camino es 16, 18
y 15 de 23 casos en tres corridas iguales, con 11 de 23 casos (48%) no reproducibles
(`docs/qa/TESTING.md:137`).

Se evaluó incorporar LangGraph (ejecución durable, checkpointer, `interrupt()`, streaming, introspección de
estado) como runtime de orquestación. Requisitos verificados leyendo el `METADATA` de los wheels publicados,
para el Python 3.13 de la imagen Docker (`backend/Dockerfile:2`): `langgraph 1.2.12` (MIT) exige
`langchain-core<2,>=1.4.7`, `langgraph-checkpoint>=4.1.0,<5`, `langgraph-prebuilt`, `langgraph-sdk` y
`xxhash`; `langgraph-checkpoint-postgres` exige `psycopg>=3.2.0` y `psycopg-pool`; el checkpointer Redis
depende de `redisvl`, que requiere los módulos RedisJSON y RediSearch (Redis 8+ o Redis Stack).

### Opciones consideradas

1. **LangGraph como runtime conversacional.**
   Ventajas: estado durable por `thread_id` —cierra el agujero de WhatsApp/Telegram y la pérdida de contexto
   al reconectar—, una sola abstracción para los tres flujos que hoy están a mano, human-in-the-loop con
   `interrupt()` (hoy el staff puede inyectar mensajes pero no pausar ni aprobar el bot,
   `backend/app/routers/staff_chat_router.py:95-149`), e introspección del flujo sin montar observabilidad.
   Desventajas: `langchain-core` 1.x es incompatible con `langchain==0.1.4`
   (`backend/requirements.txt:14-15`), que exige `langchain-core<0.2` — obliga a salir del único paquete
   LangChain que el repo usa, y solo para un text splitter (`backend/app/rag_service.py:13`);
   `langchain-core` arrastra `langsmith`, y se suman `langgraph-prebuilt`, `langgraph-sdk`, `xxhash`,
   `ormsgpack`, `orjson` y `psycopg` 3 + `psycopg-pool` como **segundo driver** de la misma base que ya usa
   `asyncpg`/SQLAlchemy; el checkpointer Redis no aplica al stack actual (`redis:7-alpine` con
   `maxmemory 128mb`/`allkeys-lru`, `docker-compose.yml:27-28`) y el de Postgres crea tablas propias en la
   base compartida por los 6 tenants; migrar los providers a `langchain-anthropic`/`langchain-deepseek`
   pierde el parámetro `thinking` que usan `DEEPSEEK_THINKING` y `bot.config.llm_thinking`
   (`langchain-deepseek 1.1.1` no lo expone: no hay ninguna mención en el wheel) y el cálculo de costo USD
   por conversación (`PRICING` en `claude_service.py:67-85` y `deepseek_service.py:31-36`); y usarlo solo
   como grafo deja afuera `create_react_agent`/`ToolNode`, que es donde está el ahorro de código.
2. **Mantener la orquestación actual y mover la decisión a código determinista**
   (plan `IUS_SEMÁFORO_ORQUESTADOR_PLAN.md`).
   Ventajas: ataca el problema medido —tokens por turno y no-determinabilidad del color— sin dependencias
   nuevas, con rollback por flag (`orchestrator_mode`) y validación offline de los casos; la lógica de nodos
   que produce es reutilizable si después se adopta un grafo.
   Desventajas: por sí sola no resuelve el estado durable multi-canal ni el HITL.
3. **Estado durable sin framework.**
   Persistir el estado del caso en Postgres (`clients.ius_state` JSONB) y rehidratar el historial desde
   `messages` en los canales webhook.
   Ventajas: cierra el agujero de estado con dos cambios acotados, sobre infraestructura que ya existe.
   Desventajas: cada flujo nuevo repite el patrón a mano y no habilita HITL.

### Decisión

Opción 2, complementada con la 3. **LangGraph no se incorpora ahora.** Aporta durabilidad y orquestación,
que no son el problema medido en este momento, y no aporta nada al determinismo ni al costo por turno: un
nodo de LangGraph es Python arbitrario, decide quién corre después, no cómo se decide. El costo de adopción
hoy es un salto de dos majors en `langchain-core` —con un segundo driver de Postgres y un checkpointer que
duplica almacenamiento ya existente en `conversations`/`messages`— a cambio de capacidades que todavía no
son requisito.

La decisión se revisa cuando aparezca **cualquiera** de estos disparadores:

- continuidad del caso entre canales (WhatsApp → web → Telegram con el mismo estado);
- HITL con aprobación (un abogado aprueba o corrige antes de que el bot registre el color o cierre el caso);
- flujos con ramas paralelas o sub-agentes;
- CI y observabilidad disponibles, que vuelven medible el beneficio de un runtime stateful.

### Consecuencias

- `langchain==0.1.4` y `langchain-community==0.0.14` quedan como están. La deuda de salir de
  `langchain-core` 0.1.x sigue pendiente y se paga al adoptar el framework, o antes si se reemplaza el text
  splitter por `langchain-text-splitters`.
- La lógica del motor determinista de `backend/app/orchestrator/` debe escribirse como estado puro
  (`CaseState` de entrada → nodo / color / regla de salida) para que, si se adopta LangGraph, sus funciones
  sean los nodos del grafo sin reescritura: la inversión no se pierde.
- Persistir el estado del caso en Postgres y rehidratar el historial desde `messages` siguen siendo trabajo
  pendiente, independiente de qué framework se use.
- Este ADR no cambia comportamiento en producción ni bloquea ninguna otra tarea.
````

### Paso 3 — Alcance del cambio

No modificar ningún otro archivo. En particular: `CHANGELOG.md` no se toca (no hay comportamiento visible
para el usuario final ni dependencias instaladas nuevas), y `docker-compose*.yml`/`requirements.txt` quedan
intactos.

## Archivos críticos y anclas

- `docs/dev/DECISIONS.md` — único archivo a editar. Insertar al final (línea 1625). Copiar el shape de
  ADR-025 (`:1573-1580`: `## ADR-0XX: Título`, línea en blanco, `**Estado:**`, `**Fecha:**`, luego
  `### Contexto` / `### Opciones consideradas` / `### Decisión` / `### Consecuencias`) y el separador `---`
  que precede a cada ADR (23 líneas `---` en el archivo, ninguna al final).
- `backend/requirements.txt:14-15`, `backend/app/rag_service.py:13`, `backend/app/claude_service.py:67-85,242,408-461`,
  `backend/app/deepseek_service.py:31-36,105`, `backend/app/routers/web_chat_router.py:239`,
  `backend/app/routers/whatsapp_webhook_router.py:93`, `backend/app/telegram_handlers.py:215`,
  `backend/app/services/prospect_auto_qualify_service.py:29-123`,
  `backend/app/services/appointment_booking_service.py:168`,
  `backend/app/services/conversation_flow_service.py:49`,
  `backend/app/routers/staff_chat_router.py:95-149`, `docker-compose.yml:27-28`,
  `docker-compose.prod.yml:44`, `backend/Dockerfile:2`, `docs/qa/TESTING.md:137` — **no se editan**; son las
  fuentes de cada afirmación del ADR. Si alguna línea cambió antes de implementar, corregir la referencia en
  el ADR (el hecho, no la cita) en vez de dejarla desactualizada.

## Verificación

No hay test automatizado para documentación; la suite de `pytest` no aplica y no debe correrse para esto.
Chequeos, desde la raíz del repo:

```bash
grep -c "^## ADR" docs/dev/DECISIONS.md          # 27 (25 ADRs previos + plantilla ADR-XXX + ADR-026)
grep -n "^## ADR-026" docs/dev/DECISIONS.md      # exactamente 1 resultado
git diff --stat                                  # solo docs/dev/DECISIONS.md
diff <(git show HEAD:docs/dev/DECISIONS.md) <(head -1625 docs/dev/DECISIONS.md)   # sin salida: el contenido previo quedó intacto
```

Y una lectura del bloque insertado verificando que: (a) sigue el formato de ADR-025 sin campo `Autores`;
(b) cada número o versión que afirma coincide con su fuente citada (en particular `langgraph 1.2.12` →
`langchain-core>=1.4.7`, y el 48% de casos no reproducibles en `docs/qa/TESTING.md:137`).

## Supuestos y contingencias

- **`devbout-docs` no se toca.** El encabezado de `AGENTS.md` lo declara fuente de verdad y pide verificar si
  algún doc suyo debe actualizarse; ya verificado que **no aplica**: `devbout-docs/docs/dev/DECISIONS.md`
  (172 líneas, 5 ADRs) es de otro proyecto (ADR-001 "FastAPI como framework backend", ADR-002 "Next.js 14 con
  App Router", ADR-005 sobre el panel de l-uploader) y su numeración colisiona con la de este repo; el
  archivo correcto para esta decisión es `gestion.ar/docs/dev/DECISIONS.md`, que tiene los 25 ADRs de
  gestion.ar. Contingencia: si al implementar se descubre una copia espejo de los ADRs de gestion.ar en
  `devbout-docs`, replicar el mismo ADR-026 allí.
- **Estado del ADR = "Aceptado".** Si el responsable prefiere dejarlo como "Propuesto" hasta una validación
  posterior, cambiar solo esa línea; el resto del bloque no depende de eso.
- **Si más adelante se decide adoptar LangGraph**, este ADR ya deja los disparadores y la forma mínima: un
  `StateGraph` con `PostgresSaver` para el turno IUS del canal web, detrás del flag `orchestrator_mode`
  (`off | shadow | active`) que ya define el plan vigente, con nodos que llaman a `get_llm_service()` en vez
  de envolver los providers en LangChain (así se conservan `llm_thinking` y el cálculo de costo), y con las
  tools actuales (`registrar_calificacion_prospecto`, booking, fuentes públicas) envueltas como funciones del
  grafo, preservando el puente `run_coroutine_threadsafe` documentado en
  `backend/app/services/prospect_auto_qualify_service.py:69-79`. Las dependencias a cambiar en ese momento
  son: `langgraph==1.2.12`, `langgraph-checkpoint-postgres`, `psycopg[binary,pool]` y reemplazar
  `langchain`/`langchain-community` por `langchain-text-splitters`.
