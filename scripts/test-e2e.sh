#!/bin/sh
set -eu

database_directory="$(mktemp -d)"
database_url="file:${database_directory}/pagescms.db"

cleanup() {
  rm -rf "$database_directory"
}
trap cleanup EXIT INT TERM

DATABASE_URL="$database_url" pnpm db:migrate
if [ "${PAGESCMS_E2E_PRODUCTION:-}" = "true" ]; then
  PAGESCMS_E2E=true VITE_DISABLE_TANSTACK_DEVTOOLS=true pnpm build
fi
E2E_DATABASE_URL="$database_url" pnpm exec playwright test "$@"
