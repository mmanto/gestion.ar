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

# Instalar dependencias de Python; devbout-oauth es repo público
RUN pip install --no-cache-dir --no-input \
      -r requirements.txt \
      "devbout-oauth @ git+https://github.com/mmanto/devbout-oauth.git@v0.2.0"

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
