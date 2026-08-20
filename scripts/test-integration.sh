#!/bin/sh
set -eu

container_name="pagescms-integration-$$"
database_password="pagescms-integration"
database_name="pagescms_integration"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_DB="$database_name" \
  --publish 127.0.0.1::5432 \
  postgres:17-alpine >/dev/null

attempt=0
until docker exec "$container_name" pg_isready -U postgres -d "$database_name" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

published_port=$(docker port "$container_name" 5432/tcp | sed 's/.*://')
database_url="postgres://postgres:${database_password}@127.0.0.1:${published_port}/${database_name}"

DATABASE_URL="$database_url" pnpm db:migrate
TEST_DATABASE_URL="$database_url" pnpm exec vitest run tests/integration
