#!/usr/bin/env bash
# Local-only, disposable PostgreSQL behavioral proof. Requires Docker running.
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTAINER="pf-verified-invoker-proof-$$"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
cleanup() { docker rm -fv "$CONTAINER" >/dev/null; }
trap cleanup EXIT
docker run -d --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$(pwd):/repo:ro" "$IMAGE" >/dev/null
ready=0
for _ in {1..30}; do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]]
docker exec -w /repo "$CONTAINER" psql -U postgres -X -v ON_ERROR_STOP=1 -f tests/verified-candidate-updates-security-invoker.pg.sql
