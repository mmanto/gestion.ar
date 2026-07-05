#!/bin/sh
set -e

echo "Running migrations (alembic upgrade head)..."
alembic upgrade head

echo "Starting application..."
exec "$@"
