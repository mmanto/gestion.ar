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

Los tests se ubican en `backend/app/tests/` (o a nivel de `backend/tests/`).

```bash
# Ejecutar todos los tests
docker compose exec backend pytest

# Con verbose
docker compose exec backend pytest -v

# Solo un módulo
docker compose exec backend pytest tests/test_bots.py

# Con coverage
docker compose exec backend pytest --cov=app
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

`scripts/test_ius_casos_semaforo.py` corre los 15 casos reales de
`~/Documentos/iUS/casos_prueba.txt` (5 esperados rojo, 5 amarillo, 5 verde)
contra el bot IUS por el canal de chat web (`/ws/chat/{bot_id}`, o
`/ws/chat/channel/{channel_id}` cuando el bot tiene canal `web`/`pwa`) y verifica
que el agente registre el color con la tool `registrar_calificacion_prospecto`
(persistido en `clients.color_semaforo`). No cubre Telegram ni WhatsApp.

Requisitos:

- Stack arriba (postgres + redis + backend). Mapeos dev: postgres `127.0.0.1:5433`,
  redis `6380`, backend `8000`.
- Bot IUS con `ius_config` moderno (`traffic_light`) y `auto_qualify_colors` no
  vacío; `--enable-auto-colors` lo habilita (dev/QA).
- Provider LLM con tool calling: `claude` o `deepseek`. **Ollama no soporta tool
  calling** (`app/ollama_service.py`), así que con ese provider la calificación
  nunca se registra.
- Con DeepSeek y `llm_thinking` activo, el `max_tokens` del bot debe ser holgado
  (≥4096): el razonamiento oculto consume el presupuesto y la respuesta queda vacía.

```bash
python scripts/test_ius_casos_semaforo.py --limit 1        # smoke
python scripts/test_ius_casos_semaforo.py                  # los 15 casos
```

Reporta OK / MISMATCH / SIN_CALIFICACIÓN por caso y sale con código 1 si alguno
no coincide. La calificación es no determinista: el resultado depende del modelo
configurado en el backend.

---

## Qué testear en cada PR

- [ ] Nuevos endpoints responden con el código HTTP correcto
- [ ] Validaciones Pydantic rechazan datos inválidos (código 422)
- [ ] Autenticación JWT: endpoints protegidos rechazan requests sin token
- [ ] Lógica de negocio del servicio modificado
- [ ] Que los cambios no rompan endpoints existentes (regression test)
