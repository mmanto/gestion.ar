# Migración de iUS a capas: orquestador determinista para el semáforo

## Contexto

El agente iUS decide el semáforo legal (verde/amarillo/rojo) dentro del LLM: `build_effective_system_prompt`
(`backend/app/claude_service.py:408-461`) inyecta **el JSON completo** de `bot.config.ius_config`
(~76 KB ≈ 19k tokens) en cada turno y el modelo recorre a mano `priority.reglas` (33 reglas) para elegir el
color, que recién llega a Python por tool calling (`registrar_calificacion_prospecto`,
`backend/app/services/prospect_auto_qualify_service.py:27-155`). Medición vigente en
`docs/qa/TESTING.md:107-127`: 3 corridas iguales del harness de 23 casos dieron 16, 18 y 15 de 23, y **11 de
los 23 casos (48%) no reprodujeron su resultado**; el propio `priority.note` de la config dice que el orden
existe "para que el orden sea lo que hace determinista la clasificación".

Objetivo: mover la decisión crítica a código determinista, dejando al LLM solo extraer datos del mensaje y
redactar la respuesta. Tres capas:

1. **Interfaz (LLM)**: 1 llamada de extracción (mensaje → JSON validado contra `state_vars`) + 1 llamada de
   redacción (nodo actual + contexto RAG → texto natural). Nunca decide color ni siguiente paso.
2. **Orquestador (código puro)**: interpreta `flow` (38 nodos), `plazos_legales`, `matriz_documentacion`,
   `priority.reglas`, `descarte_inmediato` y `acciones_por_color` **del JSON canónico**; decide nodo, color,
   cuándo invocar RAG y cuándo escribir el color.
3. **Ejecución (tools + RAG)**: `rag.get_context`, `ClientService`, y las tools auxiliares que siguen
   invocadas por el modelo (reserva de turnos).

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Fuente de verdad de la forma máquina | **Extender `docs/ius_legal_config.json`** (flags + bandas + rangos de umbrales) y actualizar validador/generador | Una sola fuente: hoy el validador ya chequea deriva reglas↔`state_vars`; una copia en Python sería invisible para él |
| Rollout | **Sombra primero, después corte por flag** `config.orchestrator_mode ∈ {off, shadow, active}` | Cambio de comportamiento medible antes de exponerlo; rollback sin deploy |
| Estado del caso | **Columna nueva `clients.ius_state` JSONB** (migración alembic) | `ClientUpdate.metadata` **reemplaza** el JSONB entero (`backend/app/services/client_service.py:298-300`): reusarlo borra `case_type`/`description` |
| Canales | **Solo web** (`/ws/chat/{bot_id}` y `/ws/chat/channel/{channel_id}`) | Donde corre el harness de 23 casos; `run_turn` queda agnóstico de canal para cablear WhatsApp/Telegram después |
| Tools auxiliares | **Siguen invocadas por el modelo** (booking y fuentes públicas); se retira solo `registrar_calificacion_prospecto` | El flujo de widget de `BookingState` no es parte de la decisión crítica |

**Costo de la etapa de sombra (respuesta a la duda planteada).** La sombra **no** corre el pipeline completo
en paralelo: se dispara **una sola vez por conversación calificada**, en el momento en que el modelo registra
el color (la config instruye "UNA SOLA VEZ por conversación", `registro_automatico_calificacion.como`).
Es 1 llamada de extracción (~1.000 tokens de prompt, `max_tokens=500`) por lead calificado, contra ~19k
tokens por turno del camino actual. El camino actual no se modifica ni se duplica: sigue usándose tal cual y
el chequeo corre en background (`asyncio.create_task`) después de responder al usuario.

**Costo esperado de la etapa activa.** Turno ≈ prompt de extracción (~900 tok) + prompt de redacción (~1.200
tok) + historial + RAG, contra ~19k tok fijos de hoy. Es el ahorro principal de la migración.

## Approach

### Paso 1 — Config canónica con forma máquina-evaluable (`docs/ius_legal_config.json`)

Tres bloques de datos nuevos, sin tocar ningún texto existente.

1.1 **Nuevo top-level `flags_de_caso`**: `{nombre_flag: {"descripcion": "..."}}`, con exactamente estas 12
entradas (una por regla de `priority.reglas` cuya condición hoy es prosa libre; la 13ª regla con `condicion`,
`personal_confianza_sector_publico`, ya filtra por `funciones_confianza_reales` y no lleva flag):

| regla (`precedencia`) | flag | descripción (texto exacto a usar) |
|---|---|---|
| `embarazo_discriminacion` (1) | `embarazo_o_condicion_protegida` | "El usuario menciona embarazo u otra condición protegida como motivo o contexto de la terminación." |
| `tema_no_laboral` (2) | `tema_no_laboral` | "El tema planteado no corresponde a una relación de trabajo (pensión, divorcio, disputa civil u otro)." |
| `fuera_de_jurisdiccion` (3) | `relacion_fuera_de_mexico` | "La relación laboral ocurrió fuera de México o bajo otra jurisdicción." |
| `hechos_no_veridicos` (4) | `relato_contradictorio` | "El relato tiene hechos contradictorios entre sí o manifiestamente inverosímiles (fechas o montos incompatibles)." |
| `usuario_conflictivo` (5) | `usuario_hostil` | "Hostilidad, amenazas o mala fe manifiesta del usuario hacia el agente o el despacho." |
| `rechazo_pago_persistente` (6) | `rechazo_pago_persistente` | "El rechazo a pagar la asesoría persiste después de un intento de manejar la objeción de precio." |
| `interinato_sindical` (12) | `interinato_plaza_titular_retorna` | "Cubrió temporalmente la plaza de un titular sindicalizado que se reincorpora." |
| `renuncia_con_promesa_liquidacion_incumplida` (15) | `renuncia_impugnada_por_escrito` | "Hubo promesa de liquidación incumplida a cambio de la renuncia, o el usuario se retractó o impugnó por escrito." |
| `rescision_sin_aviso_comision_mixta` (27) | `rescision_sin_aviso_comision_mixta` | "Rescisión (Art. 47 LFT) sin notificación a la Comisión Mixta Disciplinaria, personal sindicalizado de base con CCT IMSS-SNTSS." |
| `imss_rescision_causal_cuestionable` (28) | `rescision_causal_debatible` | "Aviso de rescisión por causal debatible o desproporcionada (faltas aisladas, ausencias justificadas)." |
| `interinato_complejo_issste` (29) | `interinato_plaza_vacante_mas_de_5_anios` | "Inició cubriendo el interinato de una plaza que quedó definitivamente vacante y continuó con nombramiento renovable más de 5 años, con documentación de la relación laboral." |
| `remocion_politica_apoyo_sector_publico` (30) | `remocion_por_motivo_politico` | "Apoyo administrativo o técnico del sector público removido por motivo político, cambio de mando, reestructura o austeridad, sin documento de renuncia ni convenio firmado." |

1.2 **`flags_requeridas: ["<flag>"]`** en cada una de esas 12 reglas (listas de exactamente 1 elemento; el
`texto` y la `condicion` existentes quedan intactos como documentación humana).

1.3 **`priority.umbrales[]`: sin cambios.** Cada entrada ya declara `nombre`, `texto`, `min_dias` y
`max_dias` (`max_dias: null` = abierto), así que el motor los consume tal cual. El único agregado es la
validación de forma (1.5). Nota para el implementador: los rangos **se solapan a propósito**
(`seis_siete_semanas` 42-49 ⊂ `uno_a_dos_meses` 22-60; `mas_de_120_dias` 121+ ⊂ `mas_de_dos_meses` 61+), por
eso una regla con filtro de tiempo se evalúa por **contención de rango** y no por una etiqueta única asignada
al caso (3.4).

1.4 **`flow[validacion_urgencia].rutas[]`: agregar `institucion` y `banda` a las 7 entradas existentes y
sumar 2 entradas faltantes** (hoy `institucion = "ninguna"` solo declara la banda de prescripción):
`{institucion:"IMSS", banda:"favorable"|"limite"|"prescripcion"}` → `filtro_calidad`/`advertencia_plazo`/
`advertencia_plazo_vencido`; idem `ISSSTE` (0-90/91-120/121+); `ninguna` → agregar
`{institucion:"ninguna", banda:"favorable", cuando:"sin institución y días <= 40", next:"filtro_calidad"}` y
`{institucion:"ninguna", banda:"limite", cuando:"sin institución y 41 a 60 días", next:"advertencia_plazo"}`.
Resultado: 9 rutas, que cubren las 3 instituciones × 3 bandas exactamente una vez.

1.5 **`backend/app/services/ius_validator.py`**: agregar `"flags_requeridas"` a `_IUS_RULE_META_FIELDS`
(línea 91) y, dentro de `_validate_ius_semaforo`, estos chequeos con `severity="error"`:
- toda regla con `condicion` no vacía debe declarar `flags_requeridas` no vacío, y toda `flags_requeridas`
  debe existir en `flags_de_caso` (guardia de migración completa);
- toda clave de `flags_de_caso` debe estar referenciada por ≥1 regla (sin flags muertos);
- cada `umbrales[]` debe traer `nombre` único, `min_dias` entero y `max_dias` entero o null con
  `min_dias <= max_dias`; el rango debe coincidir con los números declarados en `.texto` (para que el rótulo
  legible no derive del rango real). No se chequea solapamiento: es intencional (1.3);
- en `flow`, un nodo con `rutas` no vacías debe declarar en cada ruta `institucion` ∈ valores admitidos de
  `state_vars.institucion` y `banda` ∈ `{favorable, limite, prescripcion}`, cubriendo las 3 bandas para cada
  una de las 3 instituciones; un nodo con `options` debe dar `next` en cada opción; todo `next`/`options[].next`/
  `rutas[].next` debe resolver a un `flow[].id`; todo `options[].set` debe asignar claves de `state_vars` con
  valores admitidos.

1.6 **`scripts/build_ius_arbol_decision.py`**: renderizar los campos nuevos — columna "flags" en la tabla de
reglas y la banda en el paso de plazo. El generador ya recorre los campos de cada regla de forma genérica
(`scripts/build_ius_arbol_decision.py:380-390`, `:823-840`) y trata `condicion`/`evaluar` aparte (`:104-108`),
así que el agregado es explícito, no accidental. Regenerar `docs/IUS_ARBOL_DECISION.md` y `.html`.

1.7 **`backend/tests/test_ius_legal_config.py`**: sumar 3 tests de invariantes sobre el JSON real
(`CONFIG` ya está cargado en el módulo): totalidad flags↔reglas (`condicion` ⟺ `flags_requeridas`, y toda
clave de `flags_de_caso` usada); totalidad de bandas por institución en `rutas` de `validacion_urgencia` y
resolución de cada `options[].next` / `rutas[].next` a un nodo existente; umbrales bien formados
(`nombre` único, `min_dias`/`max_dias` coherentes con `.texto`).

Efecto colateral aceptado: el JSON crece ~1,5 KB (~400 tokens) y ese texto viaja en el prompt de los modos
`off`/`shadow` (que siguen volcando el JSON completo). Es el precio de tener una sola fuente.

### Paso 2 — Persistencia del estado del caso

2.1 Migración `backend/alembic/versions/20260925_1200_add_ius_state_to_clients.py`, con
`revision` nueva y `down_revision = '6d1e4b5c8a9f'` (revisión head actual, ver
`backend/alembic/versions/20260807_0000_add_device_credentials.py:16`). Nombre de archivo según
`file_template` de `backend/alembic.ini`. `upgrade`: `op.add_column('clients', sa.Column('ius_state', postgresql.JSONB, nullable=True))`;
`downgrade`: `op.drop_column('clients', 'ius_state')`. Las migraciones corren solas al arrancar el
contenedor (`backend/entrypoint.sh:4-5`).

2.2 `backend/app/db/models.py` (clase `Client`, `:261-306`): `ius_state = Column(JSONB, nullable=True)`.

2.3 `backend/app/models/client.py`: `ius_state: Optional[Dict] = None` en `Client` y en `ClientUpdate`.
`client_service._to_client` debe copiar `row.ius_state` a `Client.ius_state` y `update_client`
(`:290-318`) debe mapear `ius_state` igual que `metadata` (`update_dict["ius_state"] = value`).

Sin cambios de comportamiento: nadie lee la columna todavía.

### Paso 3 — Motor determinista (`backend/app/orchestrator/`)

Todos los módulos son funciones/objetos puros sobre el dict de config: sin DB, sin LLM, sin red (salvo
`extract.py`/`render.py`, que son los únicos que llaman al proveedor). Nuevos archivos:

3.1 **`state.py`**
```python
def vars_capturables(config: dict) -> set[str]   # claves de state_vars ∪ flow[].fields[].id
@dataclass
class CaseState:
    node: str
    vars: dict
    flags: dict
    dias: Optional[int] = None              # resuelto por plazos.computar_dias
    dias_estimados: Optional[int] = None    # estimación del extractor (fechas relativas)
    color: Optional[str] = None
    regla: Optional[str] = None
    def to_json(self) -> dict
    @staticmethod
    def fresh(config: dict) -> "CaseState"                     # node = flow[0]["id"]
    @staticmethod
    def from_json(raw, config) -> "CaseState"                  # tolerante
```
`from_json` debe degradar sin excepción: `raw` no-dict/faltante → `fresh`; `node` fuera de `flow[].id` →
`flow[0]["id"]`; `vars`/`flags` no-dict → `{}`; valores fuera de los admitidos → se descartan; `color` fuera
de `{verde,amarillo,rojo}` → `None` con `regla` en `None`.

3.2 **`plazos.py`**
```python
def umbrales(config) -> Dict[str, Tuple[int, Optional[int]]]   # nombre -> (min_dias, max_dias o None)
def computar_dias(config, state, hoy: date) -> Optional[int]
def banda(config, institucion: str, dias: int) -> Optional[str]   # favorable|limite|prescripcion
def regimen_key(institucion: str) -> str                          # IMSS→imss, ISSSTE→issste, ninguna→sin_registro
```
`computar_dias` — prioridad explícita: (1) si `state.vars["fecha_desvinculacion"]` parsea como ISO
`AAAA-MM-DD`, `dias = (hoy - fecha).days` (fuente autoritativa); (2) si no, la estimación del extractor
`state.dias_estimados` (fechas relativas, ver 3.6); (3) si no hay ninguna, `None`. Devuelve el resultado y lo
deja en `state.dias`.
Interrupción por conciliación (texto de `plazos_legales.interrupcion`), aplicada sobre el valor ya resuelto:
con `solicitud` presente, `dias = (solicitud - fecha).days`; si además hay `constancia_no_conciliacion`,
`dias = (solicitud - fecha).days + max(0, (hoy - constancia).days - 1)`. Si `dias < 0` → `None`.
`banda` usa `plazos_legales[regimen_key][favorable_hasta_dia|limite_hasta_dia|prescripcion_desde_dia]`.

3.3 **`expressions.py`**
```python
def eval_criterio(criterio: str, valores: dict) -> bool
```
Parser descendente recursivo para el DSL de `matriz_documentacion.bloques[].criterio` (`∧`, `∨`, `=`,
paréntesis, identificadores sin comillas). Identificador desconocido o sin valor → `False`. Debe evaluar los
4 criterios reales (`FUERTE`, `MEDIO`, `DÉBIL`, `SIN PRUEBAS` de `docs/ius_legal_config.json:304-327`).

3.4 **`rules.py`**
```python
def evaluar(config, state) -> Tuple[str, str]        # (color, nombre_regla)
def es_descarte(config, nombre_regla: str) -> bool
```
Implementa literalmente `priority.instruccion_de_aplicacion`: recorre `sorted(reglas, key=precedencia)`, gana
la primera que matchea, y si ninguna matchea devuelve `("amarillo", "contrato_sin_documentacion")` (regla 33,
el fallback declarado por la config). `_matchea(regla, state, umbrales)`:
- ignora `color`, `nombre`, `texto`, `condicion`, `evaluar`, `precedencia`, `pendiente_validacion_legal`,
  `flags_requeridas`;
- exige `TODOS` los `flags_requeridas` en `True` (flag ausente ⇒ `False` ⇒ la regla no aplica);
- `None` y `"cualquiera"` son wildcard (misma semántica que `ius_validator.py:199-213`; hoy solo 2 reglas usan
  `None` y ambas dependen de su flag);
- campo `tiempo_transcurrido`: matchea si algún valor listado es una banda de `umbrales` cuyo
  `[min_dias, max_dias]` contiene `state.dias` (`max_dias` null = abierto hacia arriba); sin `dias` ⇒ no
  matchea;
- resto de campos: valor de `state.vars` (o ausente) debe ser igual a alguno de los valores declarados
  (acepta escalar o lista).
`es_descarte` = el `nombre_regla` aparece en `descarte_inmediato.criterios[].regla` (separadas por `|`).

3.5 **`flow.py`**
```python
class FlowEngine:
    def __init__(self, config: dict)
    def node(self, node_id: str) -> Optional[dict]
    def resolve_option(self, node: dict, opcion_index: Optional[int], opcion_texto: Optional[str]) -> Optional[dict]
    def advance(self, state: CaseState, hoy: date, opcion_index: Optional[int] = None,
                opcion_texto: Optional[str] = None) -> str      # muta state; devuelve el nodo resultante
```
**Precondición**: `run_turn` ya mergeó `ext.vars`/`ext.flags`/`ext.dias_estimados` a `state` (paso 2 de 3.8)
**antes**
de llamar a `advance`. `advance` no captura datos: solo resuelve el destino. Esto importa porque
`flow[validacion_urgencia]` declara `fields` **y** `rutas` a la vez. Orden de resolución, exacto:
1. `node["options"]` presente: hace falta una opción resuelta; `opcion_index` (1-based sobre `options`) tiene
   prioridad, si no se compara `opcion_texto` normalizado (minúsculas, sin acentos, por substring) contra
   `options[].text`; sin match ⇒ el nodo no avanza (se vuelve a preguntar). Al resolver: aplica `set` a
   `state.vars` (valores validados contra `state_vars`; inválidos se descartan y se loguean) y sigue
   `options[].next`.
2. `node["rutas"]` no vacías: con `state.dias` y `state.vars["institucion"]` calcula la banda y elige la ruta
   con ese `institucion`+`banda`; sin `dias` o sin `institucion`, no avanza.
3. `node["next"]` presente: avanza; `terminal: true`: se detiene.
4. Nada de lo anterior: se queda en el nodo.
Guardia de bucle: máximo 4 avances por turno; cada avance recalcula `state.dias` (`plazos.computar_dias`) y, si
puede, `evaluar(config, state)` para refrescar `state.color`/`state.regla`.
- desvío por descarte: si `state.color == "rojo"` y `es_descarte(config, state.regla)`, el nodo pasa a
  `acciones_por_color["rojo"]["nodo_flow"]` (`cierre_sin_conversion`) y se detiene. En verde/amarillo el
  `flow` sigue su camino normal (`propuesta_conversion` → `captura_datos`/`mas_informacion`), que ya coincide
  con `acciones_por_color[color].nodo_flow`.

3.6 **`extract.py`** (capa 1a)
```python
@dataclass
class Extraction:
    vars: dict
    flags: dict
    opcion_index: Optional[int] = None
    opcion_texto: Optional[str] = None
    dias_estimados: Optional[int] = None
def build_extract_prompt(config, node, state) -> str
def sanitize(config, raw: dict) -> Extraction
async def extract(llm, config, node, state, historial) -> Extraction
```
- `build_extract_prompt`: prompt pequeño (~900 tok) con (a) `state_vars` y sus valores admitidos,
  (b) `flags_de_caso`, (c) la pregunta/opciones/`fields` del nodo actual, (d) la forma JSON exacta de salida
  (`{"vars": {...}, "flags": {...}, "opcion_index": n, "dias_estimados": n}`) y la instrucción de no
  inventar datos. **No** incluye `priority`, `arbol_decision`, `plazos_legales`, `matriz_documentacion`,
  `descarte_inmediato`, `acciones_por_color` ni `flow`.
- `sanitize` (garantía determinista): descarta claves fuera de `vars_capturables(config)`, valores fuera de
  los admitidos de `state_vars`, flags fuera de `flags_de_caso`; coerciona flags a `bool`; `opcion_index`
  fuera de rango → `None`; `dias_estimados` no entero o negativo → `None`.
- `extract` llama al proveedor con la interfaz existente
  (`llm.generate_response(user_message=último turno, system_prompt=..., conversation_history=historial[:-1],
  max_tokens=700, thinking=False, tools=None)`), parsea el primer bloque `{...}` (mismo patrón que
  `backend/app/services/client_field_extraction_service.py:_parse_json`) y ante cualquier fallo devuelve
  `Extraction({}, {}, None, None, None)` — nunca levanta. `thinking=False` es obligatorio: con DeepSeek y
  `llm_thinking` activo el razonamiento consume el presupuesto y la respuesta queda vacía
  (`docs/qa/TESTING.md:139-141`).
- `dias_estimados` es el único dato donde se acepta estimación del modelo, porque el propio
  `flow[validacion_urgencia].instruccion` exige "si el usuario da el tiempo en semanas o meses, usá esa cifra
  tal cual", y el fixture de 23 casos usa fechas relativas. Nunca se deriva de otras fechas
  (citatorios, actas, altas/bajas previas). Solo se usa cuando no hay fecha ISO: `plazos.computar_dias`
  prioriza siempre la fecha.

3.7 **`render.py`** (capa 1b)
```python
PROMPT_KEYS = ("agent_identity", "rules", "forbidden", "config")
def build_render_prompt(config, state, node) -> str
async def render(llm, bot, node, state, rag_context, tools, tool_executor, historial) -> dict
```
- `build_render_prompt` se arma **por allow-list** (no por borrado de claves), para que una sección nueva del
  JSON no se filtre sola: `agent_identity`, `rules`, `forbidden`, `config` + el `msg` del nodo actual, los
  `text` de sus `options`, y `acciones_por_color[color]["accion"]` cuando ya hay color + un resumen del estado
  (`"Datos del caso: institucion=IMSS; firmo_renuncia=si; ..."`). Incluye la misma línea obligatoria de texto
  plano/sin Markdown que hoy arma `build_effective_system_prompt` (`claude_service.py:439-444`), copiada
  literal.
- `render` delega en `llm.sync_generate` vía `asyncio.to_thread` (mismo shape que `_sync_generate` de
  `web_chat_router.py:842-859`) y devuelve su dict (`response`, `tokens_used`, `input_tokens`,
  `output_tokens`, `estimated_cost_usd`, `model`).

3.8 **`turn.py`** (orquestador)
```python
MODO_OFF, MODO_SHADOW, MODO_ACTIVE = "off", "shadow", "active"
def modo_orquestador(bot) -> str          # "off" si no aplica
def aplica(bot) -> bool                   # ius_config con flow (lista no vacía) + arbol_decision (dict) + priority.reglas (lista)
@dataclass
class TurnContext:  bot; client; canal: str; user_text: str; historial: list; conversation_id: str
@dataclass
class TurnResult:   reply: str; widget: Optional[dict]; node: str; color: Optional[str]; regla: Optional[str]
                    tokens_used: int; input_tokens: int; output_tokens: int; estimated_cost_usd: float
                    model: str; rag_used: bool
async def run_turn(ctx: TurnContext) -> TurnResult
async def shadow_check(bot, client_id: str, conversation_id: str, historial, color_modelo: str) -> None
```
Secuencia de `run_turn` (modo active):
1. `state = CaseState.from_json(ctx.client.ius_state, ius)` y `node = engine.node(state.node)`.
2. Si el nodo no es terminal: `ext = await extract(llm, ius, node, state, historial)`; mergear a `state`
   (`state.vars.update(ext.vars)`, `state.flags.update(ext.flags)`, `state.dias_estimados = ext.dias_estimados
   or state.dias_estimados`) y recién entonces `engine.advance(state, hoy)` — `advance` resuelve la opción
   elegida por `ext.opcion_index`/`opcion_texto`, aplica los `set` y sigue `options[].next`, `rutas[]` o
   `next` según 3.5.
3. RAG (decisión determinista, igual que hoy): `if bot.config.use_rag: rag_context = rag.get_context(
   ctx.user_text, bot_id=bot.bot_id, n_results=bot.config.rag_results_count)`.
4. Tools auxiliares: `_build_llm_tools(..., incluir_calificacion=False)` (ver 4.2) → booking/fuentes públicas
   siguen disponibles; `registrar_calificacion_prospecto` no se ofrece en active.
5. `out = await render(...)`; `reply` y `widget` salen del dict de render (si el executor de booking escribió
   `output["result"]`, ese es el mensaje/widget, igual que hoy).
6. Escritura del color (código, sin round-trip de tools): si `state.color` cambió y `state.color` ∈
   `bot.config.auto_qualify_colors`, `ClientService.update_client(client_id, ClientUpdate(
   color_semaforo=state.color, notas=..., ius_state=state.to_json(), name=..., phone=..., email=...))` con
   `notas = f"{state.regla} · " + ", ".join(f"{k}={state.vars[k]}" for k in sorted(vars_usados))`, donde
   `vars_usados` son los campos de filtro de la regla aplicada (auditoría legible sin LLM). `name`/`phone`/
   `email` se completan solo si están vacíos en el cliente y la extracción los trajo.
7. `ius_state` se persiste en **cada** turno (no solo cuando hay color).
8. Sin color calculable (faltan `institucion` o `dias`) ⇒ no se escribe `color_semaforo`; el flujo sigue
   preguntando.
9. Nodo terminal ⇒ no se vuelve a extraer en turnos siguientes; la respuesta se redacta con el estado final.

`shadow_check` (modo shadow, en background):
1. `ext = await extract(...)` sobre el historial completo con `node = flow[0]`.
2. Merge de `ext` sobre un `CaseState.fresh(config)` sin avanzar el flow (no hay posición de nodo en sombra).
3. `color_det, regla = evaluar(config, state)`.
4. `await ConversationService.merge_conversation_metadata(conversation_id, {"ius_shadow": {"modelo":
   color_modelo, "determinista": color_det, "regla": regla, "flags": ext.flags, "vars": state.vars,
   "dias": state.dias, "coincide": color_det == color_modelo, "at": <iso utc>}})`.
5. Todo el cuerpo envuelto en `try/except` con `logger.exception`: la sombra nunca afecta el turno del usuario.

3.9 **`backend/app/conversation_service.py`**: nuevo método
`async def merge_conversation_metadata(self, conversation_id: str, patch: dict) -> None` que hace
`update(ConversationModel).where(ConversationModel.conversation_id == conversation_id).values(
metadata_=ConversationModel.metadata_.op("||")(patch))` (operador JSONB `||` de Postgres). Es el único
helper nuevo del servicio; el resto de `ConversationService` no cambia.

### Paso 4 — Cableado web (modo shadow), sin cambio de comportamiento

4.1 **`backend/app/models/bot.py`**: `orchestrator_mode: Literal["off", "shadow", "active"] = "off"` en
`BotConfig` (junto a `use_rag`/`auto_qualify_colors`, `:93-118`). Ausente o inválido en el JSONB ⇒ `off`.

4.2 **`backend/app/routers/web_chat_router.py`**:
- `_build_llm_tools(bot, client, client_id, canal, incluir_calificacion: bool = True)`: el bloque de
  calificación (`:101-105`) se ejecuta solo si `incluir_calificacion` y `bot.config.auto_qualify_colors and
  client`. El resto (booking, fuentes públicas) queda igual.
- En los dos handlers (`/ws/chat/{bot_id}` ~`:318-345` y `/ws/chat/channel/{channel_id}` ~`:688-731`), el
  branch normal del LLM se envuelve así:
  ```python
  modo = modo_orquestador(bot)          # de app.orchestrator.turn
  color_antes = web_client.color_semaforo if web_client else None
  if modo == MODO_ACTIVE:
      result = await run_turn(TurnContext(bot=bot, client=web_client, canal="web",
                                          user_text=user_text, historial=conversation_history,
                                          conversation_id=conversation_id))
      outgoing_message, widget = result.reply, result.widget
      # tokens/modelo para el metadata de la conversación salen de result
  else:
      ...camino actual sin tocar...
      if modo == MODO_SHADOW:
          asyncio.create_task(_shadow_after_turn(bot, web_client_id, conversation_id,
                                                list(conversation_history), color_antes))
  ```
- `_shadow_after_turn(...)`: relee el cliente; solo si `color_antes is None and color_despues is not None`
  llama `shadow_check(...)`. Se define en `web_chat_router.py` (no en el paquete) para mantener el paquete sin
  dependencias de DB.
- La captura de campos en background (`asyncio.create_task(_capture_client_fields_background(...))`, `:277`)
  se saltea cuando `modo == MODO_ACTIVE`: en active el extractor ya entrega `nombre`/`telefono`/`correo` y no
  se paga una segunda llamada al LLM.
- El branch de `booking_state is not None` sigue con prioridad sobre el LLM/orquestador, sin cambios.

4.3 **`backend/scripts/apply_ius_config.py`**: nuevo argumento
`--orchestrator-mode {off,shadow,active}` que escribe `bot.config["orchestrator_mode"]` con
`flag_modified(bot, "config")` (no toca `ius_config`), imprime el valor resultante y respeta `--dry-run`.
Sin el argumento no modifica la clave.

### Paso 5 — Cutover a modo active

5.1 Con el bot de QA en `shadow`: correr el harness y recolectar divergencias (comandos en **Verificación**).
5.2 Criterio de corte, decidido de antemano: `orchestrator_mode = active` se activa solo si (a) los 23 casos
del fixture determinista offline dan 23/23 contra el color esperado, y (b) en sombra **no aparece ninguna
divergencia `coincide = false`** que no se haya resuelto tocando la config. Cualquier discrepancia se resuelve
en `docs/ius_legal_config.json` (banda, flag, filtro o precedencia) — **nunca** dejando que el modelo
sobrescriba el color ni con un caso especial en el código. Si dos casos exigen semánticas contradictorias del
mismo flag, se agrega un flag más específico en vez de debilitar la regla.
5.3 Activar en el bot de QA (`--orchestrator-mode active`), correr el harness en active y comparar; recién
después activar en el bot iUS de producción.
5.4 Rollback: `--orchestrator-mode shadow` (o `off`). No requiere deploy y no borra `clients.ius_state`.

## Archivos críticos y anclas

- `backend/app/routers/web_chat_router.py` — los dos WS handlers y `_build_llm_tools` (`:81-129`): único punto
  de corte web. Los dos branches del LLM tienen el mismo shape.
- `backend/app/claude_service.py` — `build_effective_system_prompt` (`:408-461`): sigue siendo el camino de
  `off`/`shadow`; `get_llm_service` (`:505-523`) es el proveedor que usan extract y render.
- `backend/app/services/prospect_auto_qualify_service.py` — la tool de calificación (`:27-155`) es el puente
  que en `active` deja de usarse, y el punto de comparación de la sombra.
- `docs/ius_legal_config.json` — fuente de verdad que el motor interpreta; sin el Paso 1 el motor no puede
  evaluar las 12 condiciones ni elegir la ruta de plazo por banda.
- `backend/app/services/ius_validator.py` — el validador es la única defensa contra la deriva config↔motor.

## Verificación

### 1. Núcleo determinista, offline (sin LLM ni DB)

cwd = raíz del repo. El working tree se monta sin rebuild:
```bash
docker compose run --rm -v "$PWD/backend:/app" --entrypoint python app \
  -m pytest tests/test_ius_legal_config.py tests/test_orchestrator_rules.py \
             tests/test_orchestrator_flow.py tests/test_orchestrator_plazos.py \
             tests/test_orchestrator_expressions.py tests/test_orchestrator_state.py -q -o asyncio_mode=auto
```
Archivos nuevos en `backend/tests/` (cargar el JSON real con el mismo helper de `test_ius_legal_config.py:19-36`):
- `test_orchestrator_rules.py`: casos de color con resultado exacto — `{institucion:"IMSS", dias:70}` →
  `("rojo","imss_mas_dos_meses")`; `{institucion:"ISSSTE", dias:100, firmo_renuncia:"si",
  renuncia_huella_voluntaria:"si"}` → `("amarillo","issste_catorce_quince_semanas_renuncia_huella_voluntaria")`;
  `{institucion:"IMSS", firmo_renuncia:"si", promesa_liquidacion_incumplida:"si", dias:10,
  flags:{renuncia_impugnada_por_escrito:true}}` → `("verde","renuncia_con_promesa_liquidacion_incumplida")`;
  estado vacío → `("amarillo","contrato_sin_documentacion")`;
- `test_orchestrator_flow.py`: `inicio`→`validacion_tema`; opción 2 de `validacion_tema` → `exploracion_tema`;
  `validacion_urgencia` con IMSS 30 días → `filtro_calidad`; IMSS 70 → `advertencia_plazo_vencido`;
  ISSSTE 100 → `advertencia_plazo`; `ninguna` 30 → `filtro_calidad` (la ruta agregada en 1.4);
  `ninguna` 70 → `advertencia_plazo_vencido`; guardia de 4 avances; color rojo por descarte → `cierre_sin_conversion`.
- `test_orchestrator_plazos.py`: días desde fecha ISO; interrupción por conciliación (solicitud sin constancia
  congela; con constancia reanuda al día siguiente); bandas por institución en los límites exactos
  (40/41/60/61, 90/91/120/121).
- `test_orchestrator_expressions.py`: los 4 criterios reales de `matriz_documentacion` con estados positivos y
  negativos.
- `test_orchestrator_state.py`: `from_json` con `None`, `{}`, `node` inexistente, valores inválidos, color
  inválido.
- `fixtures_ius_casos_estado.py` + `test_orchestrator_casos_semaforo.py`: los 23 casos de
  `docs/qa/ius_casos_semaforo.txt` traducidos a `(estado, color_esperado)` y verificados contra el motor.
  **Este es el oráculo determinista que reemplaza al harness con LLM** y la evidencia de aceptación del Paso 5.

### 2. Deriva del documento del árbol

```bash
python3 scripts/build_ius_arbol_decision.py
git diff --exit-code docs/IUS_ARBOL_DECISION.md docs/IUS_ARBOL_DECISION.html
```
Debe quedar limpio tras regenerar con el JSON del Paso 1 (el diff debe ser el de los campos nuevos, ya
commiteados).

### 3. Sombra sobre el bot de QA

Prerequisitos: stack arriba (postgres `127.0.0.1:5433`, redis, backend `:8000`), bot IUS con
`ius_config` canónico y `auto_qualify_colors` no vacío, `LLM_PROVIDER` ∈ {claude, deepseek} (con `ollama` las
tools no se invocan, `docs/qa/TESTING.md:135-137`). cwd = raíz del repo.
```bash
docker compose exec app python scripts/apply_ius_config.py --orchestrator-mode shadow --dry-run
docker compose exec app python scripts/apply_ius_config.py --orchestrator-mode shadow --apply
python scripts/test_ius_casos_semaforo.py --repetitions 3 --enable-auto-colors
```
Lectura de divergencias (mismo `.env.dev` que usa el harness):
```bash
psql "postgresql://gestionar_user:gestionar_dev_password@127.0.0.1:5433/gestionar" -c \
 "SELECT metadata->'ius_shadow'->>'modelo' AS modelo, metadata->'ius_shadow'->>'determinista' AS det,
         metadata->'ius_shadow'->>'regla' AS regla, metadata->'ius_shadow'->>'coincide' AS coincide
    FROM conversations WHERE metadata ? 'ius_shadow' ORDER BY created_at DESC;"
```
Chequeo de la garantía de costo: el conteo de filas con `ius_shadow` debe ser ≤ al número de casos que
registraron color (no 1 por turno).

### 4. Activo (aceptación)

```bash
docker compose exec app python scripts/apply_ius_config.py --orchestrator-mode active --apply
python scripts/test_ius_casos_semaforo.py --repetitions 3 --enable-auto-colors
```
Esperado: `OK por consenso 23/23` **y** `Casos con el mismo resultado en las 3 corridas: 23/23` (hoy:
16/18/15 con 11 casos inestables). Además los 23 casos offline del punto 1 deben pasar: son la garantía de que
la estabilidad viene del motor, no del modelo.

### 5. Smoke manual del cableado

Con `orchestrator_mode = active`, una conversación de un turno por el chat web:
```bash
psql "postgresql://gestionar_user:gestionar_dev_password@127.0.0.1:5433/gestionar" -c \
 "SELECT client_id, color_semaforo, notas, ius_state FROM clients ORDER BY last_contact_at DESC LIMIT 1;"
```
Debe verse `ius_state` con `node`, `vars`, `dias`; `color_semaforo` nulo tras el primer turno (todavía sin
`institucion`/`dias`) y seteado con la regla correcta al completar los datos; `notas` con el formato
`"<regla> · <campo>=<valor>, ..."`. Verificar además que el mensaje del bot sigue siendo texto plano (sin
Markdown) y que en `off` el comportamiento es idéntico al de hoy (mismo turno, mismo prompt).

## Supuestos y contingencias

- **`orchestrator_mode` se guarda en `bots.config`, no en `ius_config`**: sobrevive a
  `apply_ius_config.py` (que solo mergea las claves de primer nivel del JSON versionado) y no se propaga al
  prompt. Si en algún momento se decide moverlo, hay que tocar 4.1, 3.8 y el script.
- **Sombra con `ollama`**: si `LLM_PROVIDER=ollama`, el modelo nunca invoca la tool de calificación y no hay
  color que comparar ⇒ la sombra no produce filas. No es un fallo del orquestador; la medición de corte exige
  `claude` o `deepseek`.
- **`state.dias` depende de la extracción cuando la fecha es relativa** (el fixture usa fechas relativas). Si
  al traducir los 23 casos aparece uno donde el modelo devuelve `dias_estimados` inestable, la salida es
  pedir la fecha exacta (el propio `flow[validacion_urgencia].instruccion` lo permite) y mover ese caso del
  fixture determinista al harness con LLM, dejando constancia en el test.
- **Dos conexiones web con el mismo `device_id`** escribiendo `clients.ius_state` en paralelo: last-write-wins.
  Aceptado en esta migración (canal web, una conexión por conversación); si aparece, la contingencia es pasar
  el estado a `conversations` y bloquear por conversación.
- **`arbol_decision.pasos`**: el motor usa `flow` + `priority.reglas` + `plazos_legales`; los `pasos` del árbol
  quedan como documentación y como invariantes de validador (sus `goto` y `ramas` ya se chequean en
  `test_arbol_decision_gotos_resolve`). Si un `paso.no.goto` contradijera a `priority.reglas`, gana `reglas`
  (lo declara `arbol_decision.instruccion`: "el resultado se decide en priority.reglas").
- **`docs/qa/TESTING.md`** documenta hoy "27 reglas entonces; 32 desde el 2026-09-18" mientras el JSON tiene
  33: al tocar el Paso 1 conviene corregir esa cifra; no bloquea nada.
