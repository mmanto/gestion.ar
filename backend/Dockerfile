# syntax=docker/dockerfile:1
FROM python:3.13-slim

ENV DEBIAN_FRONTEND=noninteractive

# Setear directorio de trabajo
WORKDIR /app
# Necesario para que "alembic" (instalado como script standalone) encuentre el
# paquete app/ — tanto en el entrypoint como en sesiones `docker compose exec`
ENV PYTHONPATH=/app

# Instalar dependencias del sistema necesarias
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libssl-dev \
    pkg-config \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements
COPY requirements.txt .

# Copiar dependencias de Python; devbout-oauth es repo público
RUN pip install --no-cache-dir --no-input \
      -r requirements.txt \
      "devbout-oauth @ git+https://github.com/mmanto/devbout-oauth.git@v0.2.0"

# Modelo de embeddings de RAG: se descarga en BUILD (donde hay acceso a
# huggingface.co) y queda bakeado en la imagen, para que el runtime NUNCA
# dependa de la red. Sin esto, cada contenedor nuevo intenta descargar el
# modelo al arrancar y falla si el host no resuelve huggingface.co (ver
# docs/ops/RUNBOOK.md). Override con: docker build --build-arg EMBEDDING_MODEL=<id>
ARG EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}'); print('Modelo de embeddings bakeado:', '${EMBEDDING_MODEL}')"
# Runtime offline: huggingface_hub / transformers no intentan contactar el hub.
# EMBEDDING_MODEL se exporta para que app/rag_service.py resuelva el mismo
# modelo con el que se construyó la imagen.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    EMBEDDING_MODEL=${EMBEDDING_MODEL}

# Copiar aplicación
COPY . .
RUN chmod +x entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Exponer puerto
EXPOSE 8000

# Corre "alembic upgrade head" (Postgres, ver ADR-006) antes de levantar la app
ENTRYPOINT ["./entrypoint.sh"]

# Comando por defecto (puede ser sobreescrito por docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
