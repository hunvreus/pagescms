#!/bin/sh
set -eu

server_entry=tests/deployment/fake-pro/server.server.ts
client_entry=tests/deployment/fake-pro/client.tsx

assert_absent() {
  if rg -l "$1" "$2" >/dev/null 2>&1; then
    echo "Unexpected deployment sentinel '$1' in $2" >&2
    exit 1
  fi
}

assert_present() {
  if ! rg -l "$1" "$2" >/dev/null 2>&1; then
    echo "Expected deployment sentinel '$1' in $2" >&2
    exit 1
  fi
}

env -u PAGESCMS_DEPLOYMENT_SERVER -u PAGESCMS_DEPLOYMENT_CLIENT pnpm build
assert_absent PAGESCMS_FAKE_CLIENT_DEPLOYMENT dist
assert_absent PAGESCMS_SERVER_ONLY_SENTINEL dist

PAGESCMS_DEPLOYMENT_SERVER="$server_entry" \
PAGESCMS_DEPLOYMENT_CLIENT="$client_entry" \
pnpm build

assert_present PAGESCMS_FAKE_CLIENT_DEPLOYMENT dist/client
assert_absent PAGESCMS_SERVER_ONLY_SENTINEL dist/client
assert_present PAGESCMS_SERVER_ONLY_SENTINEL dist/server

# Leave the normal public artifact behind after the fixture assertion.
env -u PAGESCMS_DEPLOYMENT_SERVER -u PAGESCMS_DEPLOYMENT_CLIENT pnpm build
