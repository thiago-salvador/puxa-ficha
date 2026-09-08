#!/usr/bin/env bash
# Local-only, disposable PostgreSQL behavioral proof. Requires Docker running.
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTAINER="pf-h12-proof-$$"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
cleanup() { docker rm -fv "$CONTAINER" >/dev/null; }
trap cleanup EXIT
docker run -d --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$(pwd):/repo:ro" "$IMAGE" >/dev/null
ready=0
for attempt in {1..30}; do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]]
docker exec -w /repo "$CONTAINER" psql -U postgres -X -v ON_ERROR_STOP=1 -f tests/verified-candidate-updates.pg.sql
# Recreate after tested rollback, then race two independent collector sessions.
docker exec -w /repo "$CONTAINER" psql -U postgres -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260908160000_verified_candidate_updates.sql >/dev/null
query() { docker exec "$CONTAINER" psql -U postgres -X -v ON_ERROR_STOP=1 -c "$1" >/dev/null; }
observe="SELECT public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','partido',2026,'A','https://tse.jus.br','race');"
query "BEGIN; SET ROLE service_role; $observe SELECT pg_sleep(1); COMMIT;" &
first=$!
query "SET ROLE service_role; $observe" &
second=$!
wait "$first"
wait "$second"
query "DO \$\$ BEGIN ASSERT (SELECT count(*)=1 FROM verified_candidate_observations); ASSERT (SELECT count(*)=0 FROM verified_candidate_updates); END \$\$;"
observe="SELECT public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','partido',2026,'B','https://tse.jus.br','race');"
query "BEGIN; SET ROLE service_role; $observe SELECT pg_sleep(1); COMMIT;" &
first=$!
query "SET ROLE service_role; $observe" &
second=$!
wait "$first"
wait "$second"
query "DO \$\$ BEGIN ASSERT (SELECT count(*)=1 FROM verified_candidate_updates WHERE before_value='A' AND after_value='B'); END \$\$;"
echo 'PASS concurrent baseline and concurrent duplicate change'
