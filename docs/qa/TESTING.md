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

## Qué testear en cada PR

- [ ] Nuevos endpoints responden con el código HTTP correcto
- [ ] Validaciones Pydantic rechazan datos inválidos (código 422)
- [ ] Autenticación JWT: endpoints protegidos rechazan requests sin token
- [ ] Lógica de negocio del servicio modificado
- [ ] Que los cambios no rompan endpoints existentes (regression test)
