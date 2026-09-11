# iUS — Suite de calificación por semáforo: implementación y entrega

**Fecha:** 2026-09-11
**Alcance:** canal de chat web/PWA del bot iUS (no Telegram, no WhatsApp)
**Estado:** suite operativa y verificada; 3 decisiones de calificación aplicadas y pendientes de validación del cliente

---

## 1. Qué pedía el trabajo

1. Verificar si los 15 casos de prueba por semáforo (`~/Documentos/iUS/casos_prueba.txt`:
   5 rojo, 5 amarillo, 5 verde) seguían contemplados en los tests del proyecto.
2. Armar una suite de integración con LLM que los corra por el canal de chat web.
3. Investigar por qué los casos fallaban.
4. Llevar la instrucción de la herramienta al prompt canónico.
5. Decidir y aplicar los ajustes de reglas detectados, y documentarlos para el cliente.

## 2. Diagnóstico inicial

- **No existía ningún test** que cubriera esos casos: el único test que tocaba el semáforo
  era de *plumbing* (`backend/tests/test_tool_executor_event_loop_bridge.py`, color `verde`
  hardcodeado, `ClientService` mockeado). Nada corría casos reales.
- La calificación automática tiene **un solo puente implementado** en código: la tool
  `registrar_calificacion_prospecto` (`app/services/prospect_auto_qualify_service.py`),
  que persiste el color en `clients.color_semaforo`. No hay motor de reglas en código:
  `priority.reglas` / `matriz_prioridad` son contenido de prompt.
- El prompt de producción (25 reglas en `priority.reglas`) **existía solo en la base de datos**;
  no estaba versionado en ningún archivo del repo.

## 3. Qué se implementó

### 3.1 Suite de integración (`scripts/test_ius_casos_semaforo.py`)

- Parsea el fixture por secciones (`ASUNTOS EN ROJO/AMARILLO/VERDE`), valida 5 casos por color.
- Descubre el bot calificable (acepta los dos schemas de `ius_config`: `traffic_light` o
  `priority.reglas`) y su canal `web`/`pwa` activo; si no hay canal usa `/ws/chat/{bot_id}`.
  Permite `--bot-id`, `--channel-id`, `--limit`, `--casos`, `--enable-auto-colors`.
- Por caso: abre una conversación nueva (`device_id` propio → client `ius-sem-*`), envía la
  historia, repite el caso si el bot vuelve a pedir datos ya dados, y lee el color final en
  `clients.color_semaforo`. Reporta OK / MISMATCH / SIN_CALIFICACIÓN + turnos + tokens.
- Solo canal web/PWA. No toca Telegram ni WhatsApp.

### 3.2 Fixture con fechas relativas (`docs/qa/ius_casos_semaforo.txt`)

Las 5 historias GANABLE estaban fechadas en junio 2026; el prompt usa la fecha real del sistema
(`_current_date_line()` en `app/claude_service.py`), así que con "hoy" = septiembre quedaban
fuera de la ventana `pocos_dias` que exige la regla verde: **verde era inalcanzable por diseño**.
Se normalizaron las 26 expresiones de fecha del fixture a formas relativas ("hace tres días",
"a fin de mes"), preservando solo fechas históricas (ingreso, decretos). Es el fixture que la
suite usa por defecto; el original se sigue pudiendo pasar con `--casos`.

### 3.3 Instrucción explícita de la tool en el prompt

`OllamaService` no soporta tool calling, y con DeepSeek/Claude **la descripción del schema de la
tool no alcanza**: el modelo respondía con orientación o se negaba a "clasificar" (la sección
`restrictions`/`forbidden` le prohíbe dar conclusiones jurídicas, y la tool no estaba instruida).
Se agregó al prompt:

- `registro_automatico_calificacion`: cuándo y cómo invocar la tool, con la aclaración de que el
  registro es interno del CRM, no una conclusión hacia el usuario, y no contradice `forbidden`.
- Una regla más en `rules` y el paso correspondiente en `HOW_TO_USE.orden_de_ejecucion`
  (template del repo: `docs/ius_system_prompt.json`).
- Precedencia: si el caso cumple una regla ROJO, no recalificarla como amarillo/verde.

### 3.4 Decisiones de calificación aplicadas (ver §5)

Tres huecos detectados por la suite, resueltos en el prompt canónico `docs/ius_legal_config.json`
(27 reglas) y en `notas_de_aplicacion`.

### 3.5 Prompt canónico versionado (`docs/ius_legal_config.json`)

Exportación completa del prompt de producción + la instrucción de tool + las 3 decisiones. Es la
fuente de verdad propuesta: hasta hoy ese prompt vivía **solo** en la DB.

## 4. Por qué: evidencia medida

Todas las corridas: mismos 15 casos, DeepSeek `deepseek-v4-flash`, `max_tokens=4096`.

| Configuración del bot | OK | rojo | amarillo | verde |
|---|---|---|---|---|
| Prompt "merged" (traffic_light), sin instrucción de tool | 3/15 | 1/5 | 1/5 | 1/5 |
| Prompt merged + instrucción de tool, `llm_thinking=false` | 7/15 | 2/5 | 1/5 | 4/5 |
| Prompt merged + instrucción, `llm_thinking=true` | 5/15 | 2/5 | 1/5 | 2/5 |
| **Prompt de producción (25 reglas) + instrucción** | **9/15** | **5/5** | 4/5 | 0/5 |
| + procedimiento explícito de precedencia | 9/15 | 5/5 | 3/5 | 0/5 |
| **Final: 27 reglas + fixture relativo** | **9/15** | **5/5** | 3/5 | 1/5 |

Hallazgos técnicos medidos:

- **Las respuestas vacías son presupuesto de salida, no contexto.** En la corrida con
  `llm_thinking=true` cada respuesta vacía tiene `output_tokens == 4096` (el tope de
  `BotConfig.max_tokens`, `le=4096`) y `content` de 0 chars: el razonamiento oculto consume todo
  el presupuesto. El input por request nunca superó ~24k tokens (el system prompt pesa ~19.6k);
  los 60–128k que reporta la suite son el acumulado del turno, porque el loop de tools
  re-postea system+mensajes en cada ronda (`deepseek_service.py`).
- **Con `llm_thinking=false`** no hay respuestas vacías, pero el modelo aplica peor las reglas
  superpuestas de tiempo: config final elegida.
- **`OllamaService` no soporta tool calling** (`app/ollama_service.py`): con ese provider la
  calificación nunca se registra. Se requiere `claude` o `deepseek`.

## 5. Decisiones de calificación (para el cliente)

Las tres salen de casos concretos que la suite marcó mal. Requieren validación del equipo legal:
se dejaron documentadas en el prompt con texto explícito y son las únicas reglas nuevas.

1. **Embarazo / condición protegida → VERDE, sin corte por plazo.**
   *Caso:* trabajadora de Walmart despedida tras notificar su embarazo (el archivo lo marca
   GANABLE). *Por qué:* la terminación por discriminación es nula y el plazo de prescripción no
   corre, así que el corte automático por "más de 2 meses" la clasificaba rojo y descartaba un
   caso con acción viable. *Regla:* `embarazo_discriminacion` (verde), requiere que el usuario
   mencione el embarazo o la condición como motivo o contexto.

2. **Personal de confianza del sector público → se evalúa por FUNCIONES REALES, no por etiqueta.**
   *Caso:* trabajadora social de una alcaldía cuyo nombramiento decía "personal catalogada de
   confianza" pero cuyas funciones eran estudios socioeconómicos de atención al público (el
   archivo lo marca GANABLE). *Por qué:* la regla roja se disparaba por la etiqueta del
   nombramiento y descartaba casos operativos. *Ajuste:* `personal_confianza_sector_publico`
   ahora aplica solo si las funciones eran dirección, mando, manejo de recursos, representación o
   asesoría directa del titular; con funciones operativas/técnicas el caso se evalúa con las
   demás reglas. El caso de un auditor que proyecta y representa (ASF) sigue siendo de confianza.

3. **Renuncia firmada con promesa de liquidación incumplida → VERDE, no rojo automático.**
   *Caso:* vendedor de Comex con 15 años, firmó renuncia a cambio de una liquidación que nunca
   pagaron (el archivo lo marca GANABLE). *Por qué:* `renuncia_voluntaria_firmada` lo mandaba a
   rojo sin evaluar el vicio del consentimiento. *Regla:* `renuncia_con_promesa_liquidacion_incumplida`
   (verde) cuando hubo promesa incumplida o retractación documentada, dentro de plazo y con
   documentación completa; si la documentación es incompleta, sigue el camino amarillo
   (`issste_renuncia_impugnada_con_evidencia`).

## 6. Estado actual y lo que queda abierto

Resultado final: **9/15** — rojo 5/5, amarillo 3/5, verde 1/5. Los 6 casos restantes no son
problemas de infraestructura ni de contexto, sino desacuerdos de definición que necesitan
decisión del cliente:

| Caso | Archivo | Bot | Motivo |
|---|---|---|---|
| 7 (Samsung) | amarillo | sin calificación | El bot pide la fecha exacta de la rescisión antes de calificar |
| 9 (José) | amarillo | rojo | La historia no dice cuándo terminó la relación; con "cierre de la empresa" el modelo aplica plazo |
| 11 (PGR/PROVICTIMA) | verde | amarillo | La regla verde exige *copia del contrato*; la historia menciona "Formatos únicos de Personal", no copia del contrato |
| 13 (Comex) | verde | amarillo | La misma regla: la historia dice "copia algo ilegible del contrato" → documentación incompleta |
| 14 (médico IMSS) | verde | amarillo | `imss_rescision_causal_cuestionable` (regla más específica) manda amarillo |
| 15 (trabajadora social) | verde | amarillo | `contrato_sin_documentacion` manda amarillo: no menciona copia del contrato |

Preguntas para el cliente: (a) ¿la regla verde debe exigir copia del contrato, o alcanza con
acreditar la relación laboral por otros medios? (b) ¿un despido con rescisión causal cuestionable
es amarillo o verde? (c) completar en el fixture la fecha de terminación del caso 9 y la
documentación exacta de los casos 11/13/15.

## 7. Entregables

| Archivo | Qué es |
|---|---|
| `scripts/test_ius_casos_semaforo.py` | Suite de integración LLM por canal web/PWA |
| `docs/qa/ius_casos_semaforo.txt` | Fixture versionado de los 15 casos, fechas normalizadas |
| `docs/ius_legal_config.json` | **Prompt canónico** (27 reglas + instrucción de tool + notas) |
| `docs/ius_system_prompt.json` | Template del repo: paso 10 + sección `registro_automatico_calificacion` |
| `docs/IUS_SEMAFORO_INFORME_2026-09-11.md` | Este informe |
| `docs/qa/TESTING.md` (y su copia en `devbout-docs`) | Cómo correr la suite, requisitos y hallazgos |
| `CHANGELOG.md` | Entrada del cambio |
| `~/Documentos/iUS/qa_bot_ius_config_backup_2026-09-11.json` | Backup del `ius_config` previo del bot de QA |

## 8. Cómo correrla

```bash
# 1. Stack dev
docker compose up -d postgres redis

# 2. Backend con un provider que soporte tool calling (claude o deepseek)
#    (ollama NO sirve: no implementa tools)

# 3. Suite
python3 scripts/test_ius_casos_semaforo.py                # los 15 casos, fixture del repo
python3 scripts/test_ius_casos_semaforo.py --limit 1      # smoke
python3 scripts/test_ius_casos_semaforo.py --bot-id <id>  # bot explícito
```

Requisitos del bot: `auto_qualify_colors` con los colores a calificar (o `--enable-auto-colors`
en dev/QA) y, con DeepSeek, `llm_thinking=false` + `max_tokens=4096`.
