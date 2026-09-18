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

Estas preguntas están desglosadas, caso por caso, con el texto de prueba, los fragmentos que
hacen fallar cada caso y la corrección propuesta, en
`docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.md` (documento para entregar al abogado de referencia:
definiciones D1–D3, una por tema, con espacio de respuesta).

## 7. Entregables

| Archivo | Qué es |
|---|---|
| `scripts/test_ius_casos_semaforo.py` | Suite de integración LLM por canal web/PWA |
| `docs/qa/ius_casos_semaforo.txt` | Fixture versionado de los casos, fechas normalizadas (15 al 2026-09-11; 23 desde el 2026-09-18, ver §9) |
| `docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.md` | Consulta al abogado de referencia: los 6 casos abiertos, D1–D3 y la corrección propuesta de cada uno |
| `docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.html` | La misma consulta en HTML autocontenido (tema claro): los 9 `Definición` son campos de respuesta, con guardado local, descarga de las respuestas en `.md` e impresión |
| `scripts/build_ius_consulta_abogado.py` | Genera el HTML desde el `.md` (evita duplicar los 6 textos de caso a mano) |
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
python3 scripts/test_ius_casos_semaforo.py                # los casos del fixture (23 desde el 2026-09-18)
python3 scripts/test_ius_casos_semaforo.py --limit 1      # smoke
python3 scripts/test_ius_casos_semaforo.py --bot-id <id>  # bot explícito
```

Requisitos del bot: `auto_qualify_colors` con los colores a calificar (o `--enable-auto-colors`
en dev/QA) y, con DeepSeek, `llm_thinking=false` + `max_tokens=4096`.

---

## 9. Actualización 2026-09-18 — incorporación del árbol de decisión

El árbol de decisión del embudo (9 pasos de evaluación, plazos en días naturales con interrupción por
conciliación, matriz de documentación, señales de decisión, intención de pago, acciones por color y
criterios de descarte inmediato) estaba sólo en un HTML fuera del repo. Ahora vive en el prompt
canónico (`docs/ius_legal_config.json`: `arbol_decision`, `plazos_legales`, `matriz_documentacion`,
`senales_decision`, `intencion_pago`, `acciones_por_color`, `descarte_inmediato`, `HOW_TO_USE`,
`agent_identity`, `config`) y se publica como documento entregable generado:
`docs/IUS_ARBOL_DECISION.md` + `.html` (`scripts/build_ius_arbol_decision.py`, espejados en
`devbout-docs/docs/qa/`). Decisión completa: ADR-022.

Además se agregaron 5 reglas al semáforo (32 en total), activas y marcadas
`pendiente_validacion_legal: true` para el equipo legal:

| Regla | Color | Qué define |
|---|---|---|
| `issste_mas_de_120_dias` | rojo | Sector público (ISSSTE) con más de 120 días naturales desde la separación |
| `hechos_no_veridicos` | rojo | Relato contradictorio o manifiestamente inverosímil |
| `usuario_conflictivo` | rojo | Hostilidad, amenazas o mala fe hacia el agente o el despacho |
| `rechazo_pago_persistente` | rojo | Rechazo a pagar la asesoría que persiste tras manejar la objeción |
| `sin_pruebas` | rojo | Sin ningún elemento que acredite la relación laboral (matriz: SIN PRUEBAS) |

Y con ellas quedó abierta la definición **D4** (¿4 meses / 120 días naturales es el plazo del
ISSSTE?) en `docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.md`.

### Corrida medida (23 casos)

Fixture `docs/qa/ius_casos_semaforo.txt` (9 rojo / 7 amarillo / 7 verde; 8 casos nuevos). Bot
`bot_d5597add6b41` de dev con el `ius_config` canónico aplicado por
`backend/scripts/apply_ius_config.py` (dry-run + apply verificados releyendo la DB). Provider
DeepSeek `deepseek-v4-flash`: la key de Anthropic del entorno dev está sin crédito (la API devuelve
`400 credit balance is too low`), así que esta corrida no fue con Claude.

| Corrida (mismo prompt, mismo fixture y mismo harness) | OK | rojo | amarillo | verde |
|---|---|---|---|---|
| 2026-09-18, corrida A | 16/23 | 8/9 | 5/7 | 3/7 |
| 2026-09-18, corrida B | 18/23 | 9/9 | 6/7 | 3/7 |
| 2026-09-18, corrida C | 15/23 | 8/9 | 5/7 | 2/7 |
| Línea base 2026-09-11 (15 casos, prompt previo) | 9/15 | 5/5 | 3/5 | 1/5 |

**El total de una sola corrida no es evidencia, y a este instrumento le falta resolución.** Las
corridas A, B y C son el mismo prompt y el mismo harness: 16, 18 y 15 de 23 (rango de 3 casos), y
**11 de los 23 casos (48%) no reprodujeron su resultado** (3, 4, 8, 10, 11, 13, 14, 17, 19, 21, 23),
en las dos direcciones — algunos de OK a mal y otros de mal a OK. Sólo 12 casos son estables.

La causa está en las notas de la tool, no en el azar: ante el mismo caso el modelo aplica **reglas
distintas** en cada corrida (el caso 13 recibió cuatro reglas diferentes en cuatro corridas; el caso 3
alterna `personal_confianza_sector_publico` con `interinato_complejo_issste`). Ocurre cuando dos reglas
empatan en especificidad y `priority.note` no alcanza ("la más específica tiene precedencia" no es
operable si no hay un orden declarado).

Consecuencia práctica: **la comparación 9/15 → 15-18/23 no mide este cambio.** Y al revés: con esta
varianza, cualquier ajuste del prompt que se pruebe necesita N corridas y consenso por caso antes de
afirmar que mejoró algo.

### Qué sí cambió, verificado en las notas de la tool

`registrar_calificacion_prospecto` guarda en `clients.notas` el resumen del caso **con la regla que el
modelo aplicó**. Leyendo esas notas —no el marcador— aparece el cambio atribuible:

| Regla / mecanismo | Evidencia en `clients.notas` |
|---|---|
| `issste_mas_de_120_dias` (nueva) | ROJO 7: "Regla aplicada: issste_mas_de_120_dias (… sin interrupción por conciliación)" |
| `hechos_no_veridicos` (nueva) | ROJO 9: "Regla aplicada: hechos_no_veridicos" |
| `rechazo_pago_persistente` (nueva) | ROJO 8: "Rechazo persistente y explícito a pagar la asesoría" |
| `sin_pruebas` (nueva) | ROJO 1: "Adicional: sin_pruebas por ausencia de contrato, recibos de nómina…" |
| `issste_catorce_quince_semanas_efectivo` | AMARILLO 6: "Regla aplicada: issste_catorce_quince_semanas_efectivo (ISSSTE + 98-105 días + forma_pago=efectivo)" |
| `imss_seis_siete_semanas_sin_docs_indicaciones` | AMARILLO 7: "Regla aplicada: imss_seis_siete_semanas_sin_docs_indicaciones — AMBAS condiciones cumplidas" |

Las dos últimas son el punto central: `priority.umbrales` y las 6 reglas amarillas de ventana ya
existían desde el 9/11, pero el nodo `validacion_urgencia` sólo ofrecía 4 bandas y **nunca producía**
`seis_siete_semanas` ni `catorce_quince_semanas`: eran inalcanzables. Ahora se disparan y el caso queda
en el color esperado.

### Los fallos que quedan son de definición, y el modelo cita la regla

En los casos viejos que fallan, la nota nombra la regla aplicada: es una regla del cliente que dice lo
contrario de lo que espera el fixture.

| Caso | Esperado | Regla que el modelo citó |
|---|---|---|
| Comex (VERDE 3) | verde | `renuncia_voluntaria_firmada` (rojo), descartando `renuncia_con_promesa_liquidacion_incumplida` porque la promesa de liquidación fue verbal |
| Médico IMSS (VERDE 4) | verde | `imss_rescision_causal_cuestionable` (amarillo) — es la definición D2 |
| PGR→PROVICTIMA (VERDE 1) | verde | `remocion_politica_apoyo_sector_publico` (amarillo), descartando confianza e interinato "por falta de datos sobre funciones reales" |
| SEPOMEX (AMARILLO 5) | amarillo | `renuncia_voluntaria_firmada` (rojo), con la EXCEPCIÓN 1 (`issste_renuncia_impugnada_con_evidencia`) evaluada y descartada |

No es la estructura del prompt: el modelo ejecuta las reglas que existen y llega al color que esas
reglas indican. Desbloquear esos casos es responder D1–D4 (consulta al abogado), no reordenar el árbol.
En la corrida B el caso de Comex pasó a verde citando `renuncia_con_promesa_liquidacion_incumplida`: la
misma ambigüedad de precedencia resuelta al revés.

### Dos fuentes de ruido, ninguna es el árbol

1. **Solapamiento de reglas sin precedencia operable.** El mismo caso recibe reglas distintas según la
   corrida: el caso 13 (José) recibió, en cuatro corridas, "ninguna regla rojo → amarillo",
   `sin_pruebas` (rojo), `renuncia_voluntaria_firmada` (rojo) e `imss_seis_siete_semanas_efectivo`
   (amarillo); el caso 3 (ASF) alterna `personal_confianza_sector_publico` (rojo) con
   `interinato_complejo_issste` / `remocion_politica_apoyo_sector_publico` (amarillo). `priority.note`
   declara "la más específica tiene precedencia", pero eso no es operable cuando dos reglas empatan.
2. **El harness de la suite.** El cierre de `follow_up_messages` pedía "determiná el color del semáforo
   y registrá la calificación ahora"; el prompt prohíbe decirle el color al usuario, y el modelo se
   negó literalmente en dos casos ("No puedo darte el color del semáforo ni ese tipo de calificación:
   es información interna del despacho"). Reformulado sin esas palabras, esos dos casos registran el
   color esperado. Además la suite manda un mensaje monolítico y luego dice "no tengo más datos",
   mientras el flujo pregunta la fecha exacta: el usuario de prueba no responde y el bot no puede
   cerrar la evaluación.

### Fixture: fechas absolutas remanentes (corregido)

Con la instrucción nueva de computar días naturales desde la fecha de desvinculación, dos casos del
fixture con fechas absolutas viejas ("el 01 de junio", "el 16 de junio") se leían como desvinculaciones
de hace meses: el caso 14 (SEPOMEX) llegó a clasificar por `issste_mas_de_120_dias` (rojo). Esas fechas
se normalizaron a relativas en `docs/qa/ius_casos_semaforo.txt`; el fixture conserva sólo las fechas
absolutas de la historia laboral (ingreso 2000 / transferencia 2011 / alta 2020), que no son ventanas.

Verificación (2 corridas posteriores al cambio): el caso 14 ya **no** clasifica por plazo vencido —
la lectura `issste_mas_de_120_dias` sobre esa historia desapareció y en una de las dos corridas quedó
en amarillo (el color esperado) —, pero **no queda estable**: en la otra volvió a no calificar. Sigue
siendo uno de los casos no reproducibles, por la ambigüedad `renuncia_voluntaria_firmada` vs
`issste_renuncia_impugnada_con_evidencia`. Los totales de esas dos corridas (13 y 15 de 23) caen dentro
del ruido de las tres previas (15, 16, 18): no son evidencia de mejora ni de regresión.

### Los 8 casos nuevos

Los ocho casos nuevos prueban, cada uno, un comportamiento que el prompt no especificaba. La columna
"obtenido" es de la corrida A; los casos 22 y 23 (los dos verdes nuevos) fluctuaron a amarillo en la
corrida B — misma ambigüedad de precedencia descrita arriba, no un fallo del caso.

| Caso | Esperado | Obtenido (corrida A) |
|---|---|---|
| ROJO 6 · honorarios reales (medios propios, sin subordinación) | rojo (`tema_no_laboral`) | rojo |
| ROJO 7 · ISSSTE, último día hace 5 meses | rojo (`issste_mas_de_120_dias`) | rojo |
| ROJO 8 · rechazo explícito a pagar la asesoría | rojo (`rechazo_pago_persistente`) | rojo (en la corrida B quedó sin calificación por el nudge: ver "Dos fuentes de ruido") |
| ROJO 9 · fechas y salarios mutuamente incompatibles | rojo (`hechos_no_veridicos`) | rojo |
| AMARILLO 6 · ISSSTE 14 semanas + pago en efectivo | amarillo (`issste_catorce_quince_semanas_efectivo`) | amarillo |
| AMARILLO 7 · IMSS 6 semanas sin documentos de indicaciones | amarillo (`imss_seis_siete_semanas_sin_docs_indicaciones`) | amarillo |
| VERDE 6 · IMSS en tiempo y con documentación completa | verde (`verde_cinco_condiciones`) | verde (amarillo en la corrida B) |
| VERDE 7 · honorarios simulados (horario, herramientas e instrucciones del patrón) | verde (relación de trabajo) | verde (amarillo en la corrida B) |

Se mantiene lo que dice el plan: no se ajusta el árbol ni las reglas para hacer pasar los casos que
fallan. Los desacuerdos de color son definiciones del cliente (D1–D4) y las fluctuaciones son
ambigüedad de precedencia: las dos cosas se corrigen con decisiones, no con más estructura.

### Precedencia explícita y captura (mismo día, después)

Para atacar la varianza se agregó a las 32 reglas un campo `precedencia` (1 a 32),
`priority.instruccion_de_aplicacion` (recorrerlas en orden ascendente y quedarse con
la primera que coincida) y filtros reales en las reglas que sólo tenían prosa
(`firmo_renuncia`, `funciones_confianza_reales`, `documentacion`, `contrato`); las
excepciones nombradas quedaron antes de `renuncia_voluntaria_firmada`. La decisión y
sus consecuencias están en ADR-023, y el validador y el test offline exigen el orden.
Verificado en las notas del modelo: ahora cita la regla **y su precedencia**
("Regla aplicada: personal_confianza_sector_publico (precedencia 13)"), así que el
mecanismo llega al prompt.

Medición sobre los 7 casos que antes no reproducían su color (`--repetitions 3`):

| Caso | Antes (3 corridas) | Con precedencia | Tras corregir la captura |
|---|---|---|---|
| ROJO 3 (ASF) | rojo, rojo, amarillo → inestable | rojo×3 ✓ | — |
| ROJO 4 (Turismo) | rojo, rojo, sin calificar → inestable | rojo×3 ✓ | — |
| ROJO 8 (rechazo de pago) | sin calificar, rojo, rojo → inestable | rojo×3 ✓ | — |
| AMARILLO 4 (José) | amarillo, rojo, amarillo → inestable | amarillo×3 ✓ | — |
| AMARILLO 3 (chofer PROFECO) | amarillo×3 ✓ | rojo×2 ✗ | consenso amarillo (1/3 corridas califica) |
| VERDE 3 (Comex) | rojo, verde, rojo → inestable | rojo×2, amarillo×1 ✗ | consenso verde ✓ |
| VERDE 4 (médico IMSS) | amarillo×3 (MISMATCH) | rojo×1, sin calificar×2 ✗ | rojo ✗ |

Lo que enseñó: la precedencia **estabiliza** los casos cuyo encuadre ya era claro
(4 de 6), pero **amplifica los errores de captura**, porque el modelo ya no puede
"reinterpretar" la regla cuando un dato del caso quedó mal registrado en `state_vars`.
Los dos casos que empeoraron tenían exactamente eso:

1. `funciones_confianza` se llenaba con el **puesto** y no con las funciones reales, así
   que un chofer de director quedó como personal de confianza (la propia
   `notas_de_aplicacion[1]` advierte que se evalúa por funciones, no por la etiqueta).
   Se agregó `funciones_confianza_reales`, que captura el nodo que pregunta por la lista
   de funciones reales, y la regla ahora filtra por esa variable.
2. El **cómputo de la banda de tiempo** sigue siendo un juicio del modelo: el caso del
   médico (último día **hoy**) se registró como `tiempo_transcurrido=mas_de_dos_meses`
   y activó `imss_mas_dos_meses` (rojo) — incluso después de reforzar la instrucción con
   "la fecha es la del último día de trabajo; si dice 'hace 6 semanas', usá esa cifra".
   La nota del modelo lo dice literal: "Regla aplicada: imss_mas_dos_meses (precedencia 8)…
   desvinculación superior a dos meses".

**Conclusión medida:** el próximo cuello de botella no está en las reglas ni en el
árbol, sino en la captura de `state_vars` — sobre todo la banda de tiempo, que es
aritmética y hoy la resuelve el modelo con el relato. Es el argumento que faltaba para
reabrir la decisión de ADR-022 de no tener una tool determinista de plazos: con la
fecha de desvinculación y la institución, la banda (favorable / límite / prescripción)
y su interrupción por conciliación se calculan en código, y el modelo deja de
adivinar. La estabilidad medida hoy (1 a 4 casos con el mismo resultado en 3 corridas,
según el subconjunto) no se arregla con más prosa.

### Reglas de renuncia mutuamente excluyentes (cierre del mismo día)

Comex seguía repartiéndose 4 rojo / 4 verde / 4 amarillo en 12 corridas citando **las
dos** reglas de renuncia en el mismo turno: la instrucción de "quedate con la primera
que coincida" no alcanza cuando el modelo evalúa ambas y elige. Para que no puedan
coincidir, se agregó la variable `promesa_liquidacion_incumplida` con un nodo que la
captura (`validacion_promesa_liquidacion`, después del nodo de renuncia) y se hizo que
`renuncia_voluntaria_firmada` exija `promesa_liquidacion_incumplida=no_aplica` mientras
`renuncia_con_promesa_liquidacion_incumplida` exige `=si`. El nodo lleva `instruccion`
para inferir el dato del relato cuando el usuario ya lo contó, sin volver a preguntar.

Medición (`--repetitions 3`) sobre los 3 casos de renuncia más un ancla roja:

| Caso | Antes de hoy | Antes de este cambio | Con el cambio |
|---|---|---|---|
| ROJO 1 (ancla) | rojo | rojo×3 | rojo×3 ✓ |
| AMARILLO 4 (José) | amarillo 6 / rojo 3 | amarillo×3 ✓ | amarillo×3 ✓ |
| AMARILLO 5 (Irma SEPOMEX) | rojo 2 / amarillo 2 | amarillo×3 ✓ | amarillo×3 ✓ |
| VERDE 3 (Comex) | rojo 4 / verde 4 / amarillo 4 | rojo×2, amarillo×1 ✗ | **verde×2, rojo×1 ✓** |

Consenso 4/4, 3 de 4 casos con el mismo resultado en las 3 corridas (el cuarto alterna
1 vez de 3, y el consenso es el color esperado).

### Medición final de los 11 casos que flameaban (`--repetitions 3`, config definitiva)

Los 11 casos que el 2026-09-18 no reproducían su color, medidos por consenso con la
config con precedencia + capturas corregidas:

| Caso | Esperado | Antes (3 corridas) | Ahora (consenso) |
|---|---|---|---|
| ROJO 3 · ASF auditor | rojo | rojo, rojo, amarillo | **rojo×3** ✓ |
| ROJO 4 · Director Turismo | rojo | rojo, rojo, sin calificar | **rojo×3** ✓ |
| ROJO 8 · rechazo de pago | rojo | —, rojo, rojo | **rojo×3** ✓ |
| AMARILLO 1 · interinato Secretaría de Economía | amarillo | sin calificar | **amarillo×3** ✓ |
| AMARILLO 2 · Samsung (rescisión) | amarillo | amarillo, amarillo, amarillo | **amarillo×2 verde×1** ✓ |
| AMARILLO 3 · chofer PROFECO | amarillo | amarillo×3 | **amarillo** ✓ (tras corregir la captura de funciones reales) |
| AMARILLO 4 · José (transporte) | amarillo | amarillo, rojo, amarillo | **amarillo×3** ✓ |
| AMARILLO 5 · Irma SEPOMEX | amarillo | rojo, amarillo, sin calificar | **amarillo×3** ✓ |
| VERDE 3 · Comex | verde | rojo, verde, rojo | **verde×2 rojo×1** ✓ |
| VERDE 1 · PGR→PROVICTIMA | verde | amarillo, sin calificar, amarillo | amarillo×3 ✗ (estable) |
| VERDE 5 · trabajadora social | verde | sin calificar, amarillo, amarillo | rojo×2, sin calificar×1 ✗ |
| VERDE 7 · honorarios simulados | verde | verde, amarillo, verde | **verde×2 amarillo×1** ✓ |

**9 de los 11 quedaron en el color esperado**, y en las dos mediciones por consenso la
estabilidad pasó de 0 a 5/8 y 3/4 (mismo resultado en las 3 corridas). Los dos que siguen
mal son los casos de **definición**, no de ruido: PGR→PROVICTIMA y la trabajadora social
dependen de si la regla de confianza del sector público se evalúa por funciones reales o
por la etiqueta del nombramiento (D1 y `notas_de_aplicacion[1]`).

**Salvedad medida, que acota el alcance de ese 9 de 11:** la estabilidad que mejoró es
*dentro de una misma sesión*. Entre sesiones, el caso 3 (auditor de la ASF) dio
**rojo×3 en una tanda y amarillo×3 en otra**, siempre por consenso: es el mismo nudo de
definición (confianza por funciones reales vs por etiqueta), que hace que el modelo fije
`funciones_confianza_reales` distinto según cómo lea el relato. Es decir: el orden y las
capturas eliminaron el ruido *dentro* de una conversación, pero los casos de definición
siguen cambiando de veredicto *entre* corridas. Para esos tres (ASF, PGR, trabajadora
social) la respuesta del abogado (D1) es la única que cierra el tema.

Números globales del fixture: se intentó tres veces la corrida completa de 23 × 3 y no
entró en el presupuesto (la latencia del proveedor osciló entre ~10 s y ~7 min por
corrida; el último intento iba 6/23 en 28 min). Sumando lo medido a lo que ya era estable
y correcto antes, la expectativa es **~20/23**, con los casos de definición (ASF, PGR,
trabajadora social), el médico del IMSS (banda de tiempo) y lo que la salvedad anterior
agrega como fallos conocidos. El número exacto sale de
`python scripts/test_ius_casos_semaforo.py --repetitions 3` completo cuando la API esté
rápida; el script ya deja el resultado por caso a medida que avanza, así que una corrida
cortada igual sirve.

### Dimensionamiento de lo que queda

Clasificación de los fallos restantes según la regla que el modelo citó en las notas de
las corridas de hoy:

| Causa | Casos | Qué lo desbloquea |
|---|---|---|
| Definición del cliente (D1/D2/D3) | PGR→PROVICTIMA (verde vs confianza), trabajadora social (verde vs confianza por etiqueta), chofer PROFECO (remoción política vs confianza real), médico IMSS (D2: rescisión causal cuestionable) | Respuestas D1–D4 del abogado |
| Banda de tiempo (aritmética) | médico IMSS (último día hoy leído como >2 meses), José (banda), VERDE 6 ocasional | Tool determinista de plazos (fecha + institución + conciliación → banda) |
| Captura de documentación | VERDE 7 (¿simulación? ¿documentación suficiente?) | Definir qué acredita cada bloque de la matriz |

Los casos que hoy quedan **estables y correctos**: ROJO 1, ROJO 7, ROJO 9, AMARILLO 7,
AMARILLO 4, AMARILLO 5, VERDE 3 y (con el ancla) ROJO 8.

Aviso de método: la corrida completa de 23 casos × 3 no entró en el presupuesto de
tiempo (la latencia del proveedor pasó de ~10 s a ~2-5 min por corrida a lo largo de la
tarde), así que estas cifras son de **subconjuntos dirigidos** con `--repetitions 3`, no
del fixture completo. Para cerrar el número global hay que correr
`python scripts/test_ius_casos_semaforo.py --repetitions 3` completo.

### Verificación offline (sin LLM)

`backend/tests/test_ius_legal_config.py` (4 tests) corre contra el JSON versionado: sin errores
estructurales, cada regla filtra por variables declaradas en `state_vars` con valores admitidos, los
gotos del árbol resuelven a pasos/terminales existentes y los nodos del `flow` citados existen, y el
validador ignora las configs de otros tenants (ERMA). Con el JSON previo a este cambio fallan 3 de
los 4 (no hay `agent_identity`, `state_vars` es lista, no hay `arbol_decision`): son los dos defectos
que motivaron el trabajo.
