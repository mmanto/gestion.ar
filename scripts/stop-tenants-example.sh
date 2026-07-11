#! /bin/bash

cd "$(dirname "$0")/.."
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
    -f docker-compose.tenants.prod.yml down