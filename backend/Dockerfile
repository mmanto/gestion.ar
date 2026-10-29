# syntax=docker/dockerfile:1
# Etapas:
#   deps  → torch CPU + requirements (cacheable; compartida)
#   dev   → deps + entrypoint; el código va por bind mount (sin COPY . .)
#   prod  → deps + bake del modelo + COPY . . (default, última etapa)
#
# No hay `apt-get`: todas las dependencias tienen wheels para linux/amd64 y
# `devbout-oauth` se instala desde el tarball de GitHub. Así el build no
# depende de `deb.debian.org` (era el error "Temporary failure resolving" en
# VPS con DNS de Docker roto) y la imagen no lleva compilador.

FROM python:3.13-slim AS deps

# Setear directorio de trabajo
WORKDIR /app
# Necesario para que "alembic" (instalado como script standalone) encuentre el
# paquete app/ — tanto en el entrypoint como en sesiones `docker compose exec`
ENV PYTHONPATH=/app

# Copiar requirements
COPY requirements.txt .
# Wheels vendorizados para Python 3.13 (linux x86_64), porque PyPI no publica
# cp313 para estas versiones y compilarlas requiere g++ (que no está en
# python:3.13-slim):
#   - numpy 1.26.4 (langchain 0.1.4 exige numpy<2)
#   - chroma-hnswlib 0.7.3 (lo fija chromadb 0.4.22)
# Se regeneran con `pip wheel --no-deps <pkg>==<version>` en una imagen con
# toolchain. En otra arquitectura hay que regenerar ambos.
COPY vendor/ /tmp/vendor/

ENV PIP_DEFAULT_TIMEOUT=120 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Torch CPU explícito: sin esto pip resuelve torch+cuXXX desde PyPI y arrastra
# ~10 GB de librerías NVIDIA que este stack no usa (no hay GPU). Ese era el
# motivo de una imagen de ~11.8 GB y de builds de decenas de minutos.
# La versión se puede pisar con --build-arg TORCH_VERSION=...
ARG TORCH_VERSION=2.15.0
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-input --retries 5 \
      --index-url https://download.pytorch.org/whl/cpu \
      "torch==${TORCH_VERSION}+cpu"

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-input --retries 5 \
      /tmp/vendor/numpy-1.26.4-*.whl \
      /tmp/vendor/chroma_hnswlib-0.7.3-*.whl

# Copiar dependencias de Python; devbout-oauth desde tarball (sin git/apt).
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-input --retries 5 -r requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-input --retries 5 \
      "devbout-oauth @ https://github.com/mmanto/devbout-oauth/archive/refs/tags/v0.3.0.tar.gz"

# ── Desarrollo ──────────────────────────────────────────────────────────────
# Sin COPY . . y sin bake: el compose monta ./backend en /app y el modelo se
# descarga al primer uso, cacheado en el volumen hf_cache.
FROM deps AS dev

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

ENV HF_HUB_OFFLINE=0 \
    TRANSFORMERS_OFFLINE=0

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)"

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Producción ──────────────────────────────────────────────────────────────
# Bakea el modelo (con timeout) y hornea el código en la imagen.
FROM deps AS prod

# Modelo de embeddings de RAG: se intenta descargar de huggingface.co en BUILD
# para bakearlo en la imagen y que el runtime no dependa de la red. El paso es
# TOLERANTE: si falla, la imagen se construye sin el modelo y el runtime lo
# resuelve vía EMBEDDING_MODEL (ruta local o hub). El timeout evita que una red
# lenta cuelgue el deploy.
ARG EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}
ARG BAKE_EMBEDDING_MODEL=1
ARG HF_OFFLINE=1
RUN if [ "$BAKE_EMBEDDING_MODEL" = "1" ]; then \
      timeout 180 python -c 'import os; from sentence_transformers import SentenceTransformer; m=os.environ.get("EMBEDDING_MODEL"); SentenceTransformer(m); print("Modelo de embeddings bakeado:", m)' \
        || echo "[build] AVISO: no se pudo bakear el modelo (timeout/red); el runtime lo resolvera de EMBEDDING_MODEL."; \
    else \
      echo "[build] BAKE_EMBEDDING_MODEL=0: se omite el bake."; \
    fi
# Runtime offline: huggingface_hub / transformers no intentan contactar el hub.
ENV HF_HUB_OFFLINE=${HF_OFFLINE} \
    TRANSFORMERS_OFFLINE=${HF_OFFLINE}

# Copiar aplicación
COPY . .
RUN chmod +x entrypoint.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)"

EXPOSE 8000

# Corre "alembic upgrade head" (Postgres, ver ADR-006) antes de levantar la app
ENTRYPOINT ["./entrypoint.sh"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
