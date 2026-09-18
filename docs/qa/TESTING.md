# TESTING.md — Estrategia de tests

---

## Stack de testing

| Capa | Herramienta |
|---|---|
| Backend (Python) | Pytest + httpx (AsyncClient) |
| Frontend | — (pendiente: Vitest + Playwright) |
| Integración manual | Scripts `scripts/check.sh` |

---

## Tests del backend

Los tests se ubican en `backend/tests/` (el contenedor los copia en `/app/tests/`).

```bash
# Suite completa. Dentro del contenedor el pytest.ini del repo (raíz) no llega al
# build context, así que sin `-o asyncio_mode=auto` los tests async se saltean en
# silencio (24 skipped en vez de 89 passed).
docker compose exec app python -m pytest -o asyncio_mode=auto

# Solo el validador del prompt de iUS (offline: no usa LLM ni red)
docker compose exec app python -m pytest tests/test_ius_legal_config.py -q

# Lo mismo, pero con el código del working tree (sin rebuild de la imagen)
docker compose run --rm -v "$PWD/backend:/app" --entrypoint python app \
  -m pytest tests/test_ius_legal_config.py -q -o asyncio_mode=auto
```

`docker compose exec` corre la copia de `app/` y `tests/` horneada en la imagen
(`COPY . .` en `backend/Dockerfile`): después de editar el backend hay que
`docker compose build app && docker compose up -d app`, o usar la forma con
`-v "$PWD/backend:/app"`, que monta el working tree. El JSON canónico no necesita
rebuild: el compose monta `./docs` en `/app/documents` y el test lo lee de ahí.

### Deriva del documento del árbol (`docs/IUS_ARBOL_DECISION.md`)

```bash
# Regenerar y verificar que el documento corresponda al JSON vigente
python3 scripts/build_ius_arbol_decision.py
git diff --exit-code docs/IUS_ARBOL_DECISION.md docs/IUS_ARBOL_DECISION.html
```

### Convenciones

- Usar `httpx.AsyncClient` para tests de endpoints FastAPI
- Mockar servicios externos (Claude API, WhatsApp API, Telegram API) en tests unitarios
- Usar una base de datos MongoDB de test separada (variable `MONGODB_URI` con base `_test`)
- Los tests de webhooks verifican la lógica de parsing y procesamiento, no la conectividad real

---

## Tests manuales de canales

```bash
# Verificar estado general del sistema
./scripts/check.sh

# Probar health del backend
curl http://localhost:8000/api/health

# Probar RAG
curl -X POST http://localhost:8000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "horarios de atención", "n_results": 3}'

# Simular un mensaje de WhatsApp (webhook local)
curl -X POST http://localhost:8000/api/webhook/whatsapp/meta/CHANNEL_ID \
  -H "Content-Type: application/json" \
  -d '{"entry": [{"changes": [{"value": {"messages": [{"id": "test_123", "from": "+5491100000000", "type": "text", "text": {"body": "Hola"}}]}, "field": "messages"}]}]}'
```

---

## Tests de integración de canales

Para probar un canal en condiciones reales:

1. Configurar un canal de test (bot separado en Meta o Telegram de prueba)
2. Levantar el backend local con túnel HTTP (ver `docs/dev/SETUP.md`)
3. Registrar el webhook en la plataforma correspondiente
4. Enviar mensajes de prueba desde la plataforma

---

## Integración LLM — casos de semáforo IUS (canal web)

`scripts/test_ius_casos_semaforo.py` corre los 23 casos de
`docs/qa/ius_casos_semaforo.txt` (9 esperados rojo, 7 amarillo, 7 verde, con fechas
relativas) contra el bot IUS por el canal de chat web (`/ws/chat/{bot_id}`, o
`/ws/chat/channel/{channel_id}` cuando el bot tiene canal `web`/`pwa`) y verifica
que el agente registre el color con la tool `registrar_calificacion_prospecto`
(persistido en `clients.color_semaforo`). No cubre Telegram ni WhatsApp.

Requisitos:

- Stack arriba (postgres + redis + backend). Mapeos dev: postgres `127.0.0.1:5433`,
  redis `6380`, backend `8000`.
- Bot IUS con `ius_config` canónico (`agent_identity` + `priority.reglas`; el
  descubrimiento del script también acepta el esquema viejo `traffic_light`) y
  `auto_qualify_colors` no vacío; `--enable-auto-colors` lo habilita (dev/QA).
- Provider LLM con tool calling: `claude` o `deepseek`. **Ollama no soporta tool
  calling** (`app/ollama_service.py`), así que con ese provider la calificación
  nunca se registra.
- Con DeepSeek y `llm_thinking` activo, el `max_tokens` del bot debe ser holgado
  (≥4096): el razonamiento oculto consume el presupuesto y la respuesta queda vacía.

Hallazgo (corrida sobre el bot de QA, 2026-09-11): el modelo solo invoca
`registrar_calificacion_prospecto` si el `ius_config` lo instruye explícitamente
(no alcanza con la descripción del schema de la tool). Medido con el prompt de
producción (27 reglas entonces; 32 desde el 2026-09-18, en `docs/ius_legal_config.json`)
y el fixture `docs/qa/ius_casos_semaforo.txt`: sin instrucción 3/15 → con
instrucción y `llm_thinking=false` 9/15 (rojo 5/5, amarillo 3/5, verde 1/5). Con
`llm_thinking=true` reaparecen respuestas vacías: se midió `output_tokens == 4096`
(tope) con `content` vacío — es presupuesto de salida, no contexto (el input por
request no pasa de ~24k tokens). Los casos que no coinciden son desacuerdos de
definición de las reglas, no de infraestructura; detalle en
`docs/IUS_SEMAFORO_INFORME_2026-09-11.md` §6 y, caso por caso (texto de prueba,
fragmentos que hacen fallar cada caso y corrección propuesta), en
`docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.md`.

```bash
python scripts/test_ius_casos_semaforo.py --limit 1              # smoke
python scripts/test_ius_casos_semaforo.py                        # los 23 casos, 1 corrida
python scripts/test_ius_casos_semaforo.py --repetitions 3        # consenso por caso (recomendado)
```

Reporta OK / MISMATCH / SIN_CALIFICACIÓN por caso y sale con código 1 si alguno
no coincide. La calificación es no determinista: el resultado depende del modelo
configurado en el backend.

**Cómo leer el resultado (medido 2026-09-18).** Una sola corrida no es evidencia:
tres corridas con el mismo prompt, mismo fixture y mismo harness dieron 16, 18 y
15 de 23, y 11 de los 23 casos (48%) no reprodujeron su resultado. Cuando dos
reglas empatan en especificidad el modelo elige una distinta en cada corrida (ver
§9 del informe). Antes de afirmar que un cambio del prompt mejoró algo: correr N
veces (`--repetitions N`) y comparar el resultado **por caso** (el consenso que
reporta el script), nunca el total de una corrida. Con `--repetitions N` el script
imprime, por caso, el color consensuado con su conteo (`rojo×3`, `amarillo×2 rojo×1`),
cuántos casos dieron el mismo resultado en las N corridas (estabilidad) y el OK de
cada corrida individual (el ruido), y el código de salida mira el consenso.

Dos advertencias sobre el harness, ambas con medición:

- El cierre de `follow_up_messages` es parte del estímulo. Pedirle al bot que
  "determine el color del semáforo" lo pone a decir algo que el prompt le prohíbe
  y el modelo se niega ("es información interna del despacho"): dos casos quedaban
  en SIN_CALIFICACIÓN por eso, no por las reglas.
- La suite manda el caso completo en un mensaje y después dice que no tiene más
  datos. El flujo, en cambio, pregunta la fecha exacta de desvinculación y la
  conciliación: un usuario de prueba que no contesta esas preguntas deja al bot sin
  poder cerrar la evaluación.

El fixture exige **al menos un caso por color** (no exactamente 5), así que se
pueden agregar casos nuevos sin romper la suite.

```bash
# Valida offline, sin LLM, la estructura de docs/ius_legal_config.json (fuente de verdad del prompt de iUS)
docker compose exec app pytest tests/test_ius_legal_config.py -v

# Regenera docs/IUS_ARBOL_DECISION.md y docs/IUS_ARBOL_DECISION.html desde docs/ius_legal_config.json
python3 scripts/build_ius_arbol_decision.py
```

---

## Qué testear en cada PR

- [ ] Nuevos endpoints responden con el código HTTP correcto
- [ ] Validaciones Pydantic rechazan datos inválidos (código 422)
- [ ] Autenticación JWT: endpoints protegidos rechazan requests sin token
- [ ] Lógica de negocio del servicio modificado
- [ ] Que los cambios no rompan endpoints existentes (regression test)
