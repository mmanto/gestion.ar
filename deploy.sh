#!/bin/bash
# deploy.sh — deploy de producción (api.intellify.pro + admin.intellify.pro)
#
# Existe porque un deploy manual sin los dos "-f" rompió producción varias
# veces (docker-compose.prod.yml es el que trae los labels de Traefik de
# intellify.pro y las credenciales de backend/.env.prod — sin él, los
# contenedores levantan con la config vieja/dev y Traefik responde 404).
#
# Uso: ./deploy.sh   (desde cualquier lado, se ubica solo)

set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull origin main

echo "==> docker compose up (docker-compose.yml + docker-compose.prod.yml)"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "==> esperando a que levanten los servicios..."
sleep 10

echo "==> estado de contenedores"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo "==> health check"
curl -s -o /dev/null -w "api.intellify.pro:   %{http_code}\n"   https://api.intellify.pro/api/health || echo "api.intellify.pro:   sin respuesta"
curl -s -o /dev/null -w "admin.intellify.pro: %{http_code}\n"   https://admin.intellify.pro/         || echo "admin.intellify.pro: sin respuesta"
