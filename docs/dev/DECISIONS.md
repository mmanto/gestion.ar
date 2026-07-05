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
