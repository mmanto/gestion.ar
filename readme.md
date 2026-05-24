
  Uso:
  # Desarrollo (docker-compose.yml solo)
  docker compose up -d

  # Producción
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

  # Conectar desde el host a MongoDB/Redis
  mongosh mongodb://localhost:27018/gestionar_dev
  redis-cli -p 6380