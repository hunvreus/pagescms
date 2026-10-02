#!/bin/sh
set -eu

database_directory="$(mktemp -d)"
database_url="file:${database_directory}/pagescms.db"
cache_database_url="file:${database_directory}/pagescms-cache.db"

cleanup() {
  rm -rf "$database_directory"
}
trap cleanup EXIT INT TERM

DATABASE_URL="$database_url" CACHE_DATABASE_URL="$cache_database_url" pnpm db:migrate
TEST_DATABASE_URL="$database_url" TEST_CACHE_DATABASE_URL="$cache_database_url" pnpm exec vitest run --no-file-parallelism tests/integration
