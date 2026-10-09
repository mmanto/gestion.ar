# Análisis de impacto: Ollama propio (`https://apimodel.intellify.pro`) con `hf.co/mradermacher/Qwen2.5-7B-Spanish-0.2-i1-GGUF:Q4_K_M`

## Contexto

Se evalúa apuntar `OLLAMA_BASE_URL` a un servidor Ollama propio (`https://apimodel.intellify.pro`,
v0.33.3, un único modelo servido: `Qwen2.5-7B-Spanish-0.2` Q4_K_M, 4.68 GB, 7.62B parámetros) y usar
ese modelo como LLM de gestion.ar (`LLM_PROVIDER=ollama`). Hoy producción corre `deepseek`
(`.env.prod:31`), `deepseek-v4-flash`; dev tiene ollama apuntado a un Ollama local
(`.env.dev:62,65`) y la app ya soporta los tres proveedores vía `get_llm_service()`
(`backend/app/claude_service.py:505-523`).

El entregable es un **análisis medido** que quede en el repo (documento técnico + ADR), no un cambio
de código: el veredicto de este plan es que **no es viable como proveedor global**, y el plan fija
qué documento se escribe, con qué números, y cómo se verifica que siguen siendo ciertos.

Todo lo numérico de este plan se midió contra el servidor real el **2026-09-28** desde esta máquina
(los scripts de reproducción están en **Verificación**).

## Veredicto

- **No reemplaza a `deepseek` como proveedor global.** Con `ctx` por defecto (4096) el 100% de los
  turnos reales medidos se truncarían; incluso configurando la ventana máxima del modelo (32 768)
  el 28,5% de los turnos no entra, y el prefill del prompt IUS (~23 k tokens) tarda ~13 min, por
  encima del corte de 600 s del proxy del servidor y del `OLLAMA_TIMEOUT=120 s` de la app.
- **Se caen en silencio 3 familias de features** por falta de tool calling (calificación de
  semáforo, reserva de turnos, fuentes públicas en vivo) — `OllamaService` ignora `tools`, y además
  el modelo no emite `tool_calls` ni con instrucción explícita (medido).
- **Sirve solo para el subconjunto** de bots sin `ius_config`, sin `auto_qualify_colors`, sin booking
  ni fuentes públicas, con prompts chicos (~1–2 k tokens) y de a un usuario a la vez — aun así a
  60–100 s por turno.
- **El único argumento que sigue en pie es residencia de datos** (hoy los relatos laborales y la PII
  de clientes salen hacia `api.deepseek.com`). El argumento de costo de ADR-001
  (`docs/dev/DECISIONS.md:31-51`, migrar cuando el costo de API supere ~US$40/mes) **no se cumple**:
  el gasto medido en DB son ~US$3,12–3,50 por corrida de la suite de semáforo con `deepseek-v4-flash`
  y ≈US$0 de tráfico real de tenants.

## Mediciones (servidor real, 2026-09-28)

| # | Prueba | Resultado medido |
|---|---|---|
| M1 | `/api/version`, `/api/tags`, `/api/show` | Ollama 0.33.3; 1 modelo (4.68 GB, 7.62B, Q4_K_M); `capabilities: [completion, tools, insert]`; `qwen2.context_length = 32768`; template con bloque `<tools>` |
| M2 | `/api/ps` | `size_vram: 0` → **inferencia en CPU**; `context_length: 4096` (default, la app no manda `num_ctx`); `expires_at` = +5 min (keep_alive default) |
| M3 | Cold start | 114,7 s de carga antes de la primera respuesta |
| M4 | Throughput | prefill **28–35 tok/s**, salida **10–17 tok/s** |
| M5 | Prompt 1 045 tok → 49 tok de salida | 36,1 s |
| M6 | Prompt 3 765 tok → 35 tok de salida | 95,0 s |
| M7 | Prompt 13 333 tok (default ctx) | `prompt_eval_count = 2050` → **truncado a ~1/6** |
| M8 | Marcador al inicio vs al final de un prompt de 30 020 chars | responde `MANDARINA` (el del final) → **la truncación conserva la cola y descarta la cabeza** |
| M9 | 2º turno con prefijo idéntico + cola nueva | `prompt_eval_cached_count = 4070/4092` → **99,5% de cache de prefijo**; 4,8 s vs 141,5 s del 1º |
| M10 | 3 requests concurrentes triviales | se serializan: 8,9 / 7,5 / 13,7 s (no hay paralelismo real) |
| M11 | Prompt IUS completo (78 019 chars ≈ 22,9 k tok) + caso, `num_ctx=32768` | **HTTP 504** del proxy de `apimodel.intellify.pro` a los **601 s** |
| M12 | Mismo prompt con `ctx` default (app tal cual) | 94 s, `prompt_tok=2050`, salida con regla inventada («regla "pocos días (0-7 días)"» para un despido de 2 meses y medio) y conclusión errónea («no tienes derecho a indemnización») |
| M13 | `tools=[registrar_calificacion_prospecto]` + instrucción explícita en el system prompt | `tool_calls: None` en las dos pruebas (con y sin instrucción explícita) → el modelo no emite la llamada |
| M14 | Reglas del semáforo en contexto (17 665 chars ≈ 5,2 k tok) + 3 casos (rojo/amarillo/verde) | **0/3 correctos**: rojo→`verde`, amarillo→`Verde`, verde→`Amarillo` (prompt parcial: sin `flow`/`priority`; 1 corrida) |
| M15 | Sin autenticación | todas las peticiones anteriores funcionaron sin token |

### Qué exige hoy el tráfico real (DB local, tabla `messages.metadata`)

Medido sobre 1 885 turnos de assistant con `model=deepseek-v4-flash`, todos del bot
`bot_d5597add6b41` («Asistente», `ius_config` de 63 510 chars, `auto_qualify_colors=[verde,amarillo,rojo]`):

- input tokens: **p50 = 23 069**, p75 = 42 145, p95 = 47 729, máx = **72 785**.
- **1 885/1 885 (100%) > 4096** → con el `ctx` default, *todos* los turnos se truncarían.
- **537/1 885 (28,5%) > 32 768** → no entran ni en la ventana máxima del modelo.
- output: promedio 430 tok, p95 1 526 tok (`bot.config.max_tokens` default 1024, máx 4096 —
  `backend/app/models/bot.py:92`).
- Costo implícito de esa data: **US$7,73** con `deepseek-v4-flash` (input 0,14 / output 0,28 por
  millón, `backend/app/deepseek_service.py:31-36`), US$20,53 si fuera Haiku. Concentrado en las
  corridas de la suite (2026-09-11: 318 turnos US$1,11; 09-18: 869 turnos US$3,50; 09-22: 701
  turnos US$3,12); el tráfico real de tenants en esa DB es marginal (tenant `78f507331c18`: turnos
  de 44–94 tokens de input).

## Impacto por superficie

### 1. Ventana de contexto — hoy el bot IUS quedaría sin instrucciones

- `backend/app/ollama_service.py:46-53` arma `options = {"num_predict": max_tokens}`: **nunca manda
  `num_ctx`**, así que vale el default 4096 del servidor (M2) y el prompt se recorta (M7) a ~2050
  tokens.
- La truncación conserva la **cola** (M8). El system prompt viaja primero
  (`build_effective_system_prompt`, `backend/app/claude_service.py`), así que lo que se pierde es
  exactamente el principio del prompt: con `ius_config`, los primeros 43 KB (`HOW_TO_USE`,
  `agent_identity`, `flow` 19,4 KB y `priority` 23,7 KB de `docs/ius_legal_config.json`). El bot
  queda sin identidad, sin flujo y sin orden de precedencia; M12 es la evidencia de qué responde en
  ese estado.
- Aun con `num_ctx=32768` (máximo del modelo): 28,5% de los turnos no entra, y el prefill de 23 k
  tokens a 28–35 tok/s son ~11–14 min (M4/M6/M11).
- Bots sin `ius_config`: `system_prompt` de 47–123 chars + contexto RAG de `rag_results_count` (3 por
  defecto) × `chunk_size=500` (que en `RecursiveCharacterTextSplitter` son **caracteres**, no tokens,
  `backend/app/rag_service.py:74-78`) ≈ 1,5 k chars ≈ 0,5 k tokens → **esos sí entran** en 4096.

### 2. Latencia y cadena de timeouts — falla en todas las capas

`OLLAMA_TIMEOUT` default **120 s** (`backend/app/ollama_service.py:23`, `.env.dev:67`) con
`httpx.Client(timeout=...)` (`:62-63`). Contra eso:

- turno real medido de 3 765 tokens = **95 s** (M6) → ya roza el límite; 23 k tokens = ~13 min (M11).
- proxy de `apimodel.intellify.pro`: **504 a los 600 s** (M11) — techo duro del servidor propio.
- `frontend*/nginx.conf:51,73` `proxy_read_timeout 120s` para `/api/`; Traefik sin
  `respondingTimeouts` (default `readTimeout 60s`); `/ws/` sí 3600 s.
- **No hay streaming en ningún lado**: `"stream": False` (`ollama_service.py:51`) y cero
  coincidencias de SSE/`"stream": True` en backend y frontends. El web chat manda un único frame al
  final (`backend/app/routers/web_chat_router.py:408-413`); mientras tanto el usuario ve sólo el
  indicador de «escribiendo» y, si el turno excede el timeout, `{"type":"error",
  "message": bot.config.fallback_message}` (`:417-419`).
- Webhooks: el LLM corre **dentro** del request (`whatsapp_webhook_router.py:93-104`, LLM y luego
  `send_message` en `:268-294`), sin `BackgroundTasks` en todo `backend/app`. Si el turno tarda,
  `httpx` corta → HTTP 500 (`:296-299`) → Meta reintenta. Y en WhatsApp **no hay idempotencia**:
  `is_duplicate_message` existe (`backend/app/whatsapp_service.py:116`) pero nunca se llama (sólo
  Telegram deduplica, `telegram_webhook_router.py:105`) → **cada reintento vuelve a ejecutar el LLM y
  reenvía la respuesta al usuario**. Con un LLM de ~100 s esto deja de ser hipotético.
- Lo que sí juega a favor: el cache de prefijo (M9) hace que los turnos 2..N de una conversación
  cuesten ~5 s **si** el prompt entra en la ventana y el slot conserva el KV de esa conversación. Con
  `num_parallel` default 1 y 12 tenants contra 2 workers uvicorn, cada conversación nueva desaloja la
  anterior y paga el prefill completo; tras 5 min de inactividad el modelo se descarga (M2) y el
  próximo turno paga 115 s de carga (M3).

### 3. Tool calling — 3 features se apagan sin error visible

- `backend/app/ollama_service.py:41-45`: `tools`/`tool_executor` se aceptan «por paridad de interfaz»
  y se descartan; el comentario ya lo declara.
- Las 3 familias de tools que arma `_build_llm_tools` (`web_chat_router.py:85-129`, replicado en
  WhatsApp/Telegram): `QUALIFICATION_TOOL_SPEC` (semáforo → `auto_qualify_colors`), `BOOKING_TOOL_SPEC`
  (turnos) y `build_public_sources_tools` (SIBOM/farmacia de pachoteayuda, ADR-018/ADR-020). El bot
  responde texto y la acción nunca ocurre: la calificación no se registra, el turno no se reserva, la
  fuente en vivo no se consulta.
- Además el modelo no emite `tool_calls` (M13), así que **implementar el loop de tools en
  `OllamaService` no alcanza** con este GGUF.
- La suite de semáforo queda inutilizable (no hay color que comparar): ya está documentado en
  `docs/qa/TESTING.md:135-137` y `IUS_SEMÁFORO_ORQUESTADOR_PLAN.md:489`.

### 4. Calidad

- M14: 0/3 casos del fixture mal clasificados con las reglas en contexto. Caveat honesto a escribir
  en el documento: prompt parcial (sin `flow`/`priority`), 1 sola corrida, y la suite oficial exige
  `--repetitions N` porque incluso `deepseek-v4-flash` da 16–18/23 con 48% de casos que no
  reproducen (`docs/qa/TESTING.md:141-150`).
- Riesgo de compromiso: el bot IUS emite calificación con la que se decide a qué prospectos se
  persigue; un 7B no sostiene 32 reglas + orden de precedencia + ramas D1–D4 (ADR-022..ADR-025).
- Lo que **sí** parece sobrevivir (probado aislado, no end-to-end): JSON para extracción de campos
  (`client_field_extraction_service.py:88-96`) devolvió JSON válido, y el resumen de conversación usa
  la misma vía. Los embeddings del RAG son locales (`rag_service.py`, sentence-transformers): no
  dependen del proveedor.

### 5. Costo y observabilidad

- `OllamaService.calculate_cost` devuelve **0.0** (`ollama_service.py:26-27`) → `total_cost_usd` en
  `conversations`/`clients` (`backend/app/db/models.py:326-327,283`) y cualquier reporte de gasto
  quedan en 0 mientras el consumo de CPU del servidor propio sí existe.
- Los tokens sí se registran: `prompt_eval_count`/`eval_count` → `input_tokens`/`output_tokens`
  (`ollama_service.py:91-93`). Ojo: con el prompt truncado esos números cuentan lo **evaluado**
  (2050), no lo enviado → subreportan el contexto real.
- `/public/llm-info` (`backend/app/routers/public_router.py:61-70`) reporta `provider`/`model` al
  frontend: cambiaría a `ollama` + el nombre largo del GGUF.

### 6. Infraestructura

- No hay servicio `ollama` en ningún compose del repo; `apimodel.intellify.pro` es **externo al
  stack** y —como el resto de `*.intellify.pro` (nango, appointments-widgets)— vive en la misma
  familia de dominios, así que probablemente sea una caja compartida (no verificado). Compartir
  máquina con otras apps significa que la latencia medida también depende de la carga de terceros.
- El servidor no pide autenticación (M15): cualquiera con la URL consume la GPU/CPU de la casa.
- `.env.example:41` apunta a `http://ollama:11434` (host que no existe en el compose) y
  `OLLAMA_MODEL=qcwind/qwen3-8b-instruct-Q4-K-M:latest`; adoptar este modelo implica editar además
  `OLLAMA_BASE_URL`.

## Entregable 1 — `docs/dev/ANALISIS_LLM_OLLAMA_QWEN25_7B.md` (archivo nuevo)

Contenido exacto, en este orden:

1. **Título y alcance**: qué se evalúa (servidor propio + este GGUF), fecha de medición, comando/host
   usado, y que los números son del 2026-09-28 (re-medir si pasan semanas; el servidor puede cambiar
   de hardware o de modelo cargado).
2. **Resumen ejecutivo** = la sección **Veredicto** de este plan, en 5 bullets.
3. **Mediciones** = tabla M1–M15 de este plan (copiar tal cual, incluida la columna de evidencia).
4. **Qué exige el tráfico real** = los percentiles de tokens y el costo actual (sección homónima).
5. **Impacto por superficie** = secciones 1–6 de arriba, con las referencias `archivo:línea` ya
   listadas. Cada afirmación con su medición (`Mx`) al lado.
6. **Qué haría falta para que fuera viable** (si en el futuro se decide adoptar):
   - Servidor con GPU y RAM para `num_ctx ≥ 32768` (KV de qwen2.5-7B ≈ 1,9 GB a 32 k, f16) y
     `num_parallel ≥ 4`; hoy `size_vram = 0`.
   - `OllamaService.sync_generate`: mandar `options.num_ctx` (nuevo env `OLLAMA_NUM_CTX`, default que
     cubra el prompt real) y `keep_alive` explícito; subir `OLLAMA_TIMEOUT` por encima del prefill.
   - Subir el timeout del proxy de `apimodel.intellify.pro` (>600 s) o acortar el prompt por debajo de
     lo que entre en 600 s de prefill.
   - Loop de tool calling en `OllamaService` (espejo del de `deepseek_service.py:105`,
     `claude_service.py:242`) **y** un modelo que emita `tool_calls` (M13 lo descarta para este GGUF).
   - Enrutamiento por bot (`LLM_PROVIDER` por bot) si se quiere híbrido: hoy el proveedor es global
     (`get_llm_service()` sin argumentos) y lo leen 6 call sites.
   - Resolver la idempotencia de WhatsApp antes de exponer a un LLM lento.
7. **Qué queda igual**: embeddings/RAG locales, extracción de campos y resumen si el modelo devuelve
   JSON válido (probar), multi-proveedor (`get_llm_service`).

Referencias internas a enlazar desde el documento: `docs/dev/DECISIONS.md` (ADR-001 y el ADR nuevo),
`docs/qa/TESTING.md` (líneas de tools y de variabilidad del semáforo), `ENV.md` (variables
`OLLAMA_*`), `docs/ops/INFRASTRUCTURE.md` si se documenta el servidor como infra propia.

## Entregable 2 — ADR + CHANGELOG

1. `docs/dev/DECISIONS.md`: agregar al final, siguiendo el formato del archivo (`### Contexto`,
   `### Opciones consideradas`, `### Decisión`, `### Consecuencias`), un ADR titulado
   **`## ADR-027: Ollama propio (Qwen2.5-7B Q4_K_M) descartado como proveedor LLM global`**.
   Verificar antes que el número siga libre:
   `grep -n "^## ADR-0" docs/dev/DECISIONS.md | tail -3` (hoy el máximo formalizado es ADR-025; el
   número 026 queda reservado por el plan `ADR_026_LANGGRAPH_PLAN.md`, por eso se usa 027).
   Contenido: contexto (servidor + mediciones M1–M14 resumidas), decisión (no adoptar como global;
   `deepseek` sigue en prod), consecuencias (se mantiene el costo variable ~US$3–4 por corrida de
   suite; queda abierto el requisito de privacidad si aparece; si se retoma, los prerequisitos están
   en el documento de análisis §6), y la relación con ADR-001 (el criterio de costo > US$40/mes no se
   cumple; el de privacidad sigue siendo el único disparador válido).
2. `CHANGELOG.md`: una entrada en `## [Sin versión] - En desarrollo` → `### Agregado` (el bloque ya
   existe, empieza en la línea 9) con el texto:
   `- **Análisis de impacto de Ollama propio con Qwen2.5-7B-Spanish Q4_K_M**
   (`docs/dev/ANALISIS_LLM_OLLAMA_QWEN25_7B.md`) + ADR-027 en `docs/dev/DECISIONS.md`: medido contra
   `apimodel.intellify.pro` (CPU, ctx default 4096, prefill 28–35 tok/s). Conclusión: descartado como
   proveedor global — el 100% de los turnos reales medidos supera 4096 tokens (p50 23 069) y el 28,5%
   supera la ventana máxima del modelo (32 768); además el modelo no emite `tool_calls`, así que se
   pierden calificación de semáforo, booking y fuentes públicas. Sin cambios de código.`
3. No se tocan `ENV.md`, `.env.dev`, `.env.prod` ni código: la decisión es no adoptar. Si el usuario
   elige adoptar en cambio, los prerequisitos quedan listados en el documento §6 y se planifican
   aparte.

## Verificación

1. **Reproducir las mediciones** (contra el servidor real; ~25 min por el prefill lento; requiere
   red al host):
   ```bash
   cd /home/mmanto/workspace/gestion.ar
   curl -s https://apimodel.intellify.pro/api/version
   curl -s https://apimodel.intellify.pro/api/ps
   ```
   y los dos probes de este análisis (mismo código que produjo M4–M14):
   - probe de latencia/truncación: pide `/api/chat` con
     `system = "PLATANO. " + filler*400 + " MANDARINA."` y `options={"num_predict":20}` sin
     `num_ctx`; esperado: `prompt_eval_count=2050` y respuesta `MANDARINA` (M7/M8).
   - probe de tools: `tools=[QUALIFICATION_TOOL_SPEC]` + instrucción explícita; esperado
     `message.tool_calls = None` (M13).
   - probe IUS: system de 78 019 chars + `num_ctx=32768`; esperado: 504 del proxy cerca de 600 s
     (M11). Si ya no da 504, el servidor cambió → re-medir antes de publicar el documento.
2. **Verificar los números de la DB** (mismo host, `PGPASSWORD=gestionar_dev_password psql -h
   127.0.0.1 -p 5433 -U gestionar_user -d gestionar`):
   ```sql
   select count(*) n, round(percentile_cont(0.5) within group (order by (metadata->>'input_tokens')::int)) p50,
          sum(((metadata->>'input_tokens')::int > 32768)::int) gt_32768
   from messages where role='assistant' and metadata->>'input_tokens' is not null;
   ```
   esperado: `n=1885`, `p50=23069`, `gt_32768=537`. Si cambió, actualizar la tabla del documento y no
   la conclusión (la conclusión sólo se sostiene si p50 sigue por encima de 4096).
3. **Documento**: confirmar que cada afirmación de `docs/dev/ANALISIS_LLM_OLLAMA_QWEN25_7B.md` tiene
   una fila Mx o un `archivo:línea`; que no quede ninguna referencia a números sin medición.
4. **ADR**: `grep -n "ADR-027" docs/dev/DECISIONS.md` y confirmar que el formato coincide con los
   ADR-024/025 existentes (encabezados y estilo).

## Supuestos

- El entregable es documentación en el repo (no cambios de código ni de configuración), porque la
  pregunta fue de análisis y el veredicto medido es «no adoptar». Si el usuario prefiere que además se
  deje el dev apuntado a `apimodel.intellify.pro` para pruebas manuales, eso es otra tarea
  (`OLLAMA_BASE_URL`/`OLLAMA_MODEL` en `.env.dev`, sin cambios de código) — **no** incluida acá.
- Los números de la DB corresponden al snapshot local (1 885 turnos, todos del bot IUS). Si en el VPS
  hay tráfico de otros tenants con volumen, los percentiles de *esos* bots deben medirse aparte: la
  conclusión de contexto aplica al bot IUS; los bots chicos sólo se ven afectados por latencia.
- `apimodel.intellify.pro` es infraestructura propia de la casa (mismo dominio que nango/appointments)
  y puede compartir máquina con otras apps: la latencia medida es el piso, no una propiedad del modelo.
