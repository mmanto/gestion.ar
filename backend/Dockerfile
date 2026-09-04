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

# Modelo de embeddings de RAG: se intenta descargar de huggingface.co en BUILD
# para bakearlo en la imagen y que el runtime no dependa de la red. El paso es
# TOLERANTE a propósito: si este host no alcanza huggingface.co (DNS/egress
# bloqueado), el build CONTINÚA sin el modelo en vez de abortar — un abort acá
# deja corriendo la imagen vieja para siempre (deploy fallido). Cuando el bake
# falla, el runtime resuelve el modelo vía EMBEDDING_MODEL=<ruta local montada>
# (docker-compose.prod.yml monta /models/embedding-model) o falla con un error
# accionable. Override del id: docker build --build-arg EMBEDDING_MODEL=<id>
ARG EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}
RUN python - <<'PYEOF'
import os
from sentence_transformers import SentenceTransformer
model = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
try:
    SentenceTransformer(model)
    print("Modelo de embeddings bakeado:", model)
except Exception as exc:
    print("[build] AVISO: no se pudo bakear el modelo de embeddings (", type(exc).__name__, ":", exc, ")")
    print("[build] La imagen queda sin modelo. En runtime se cargará de EMBEDDING_MODEL si apunta a un snapshot local, o fallará con error accionable (ver docs/ops/RUNBOOK.md).")
PYEOF
# Runtime offline: huggingface_hub / transformers no intentan contactar el hub.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

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
