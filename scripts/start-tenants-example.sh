#! /bin/bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    -f docker-compose.tenants.prod.yml up -d --build