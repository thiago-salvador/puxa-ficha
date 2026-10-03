#!/usr/bin/env bash
# Somente banco efêmero local, sem rede ou credenciais produtivas.
set -euo pipefail
task_root="$(cd "$(dirname "$0")/../.." && pwd)"
container_name="pf-646-rpc-$$"
image='postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317'
trap 'docker rm -f "$container_name" >/dev/null 2>&1 || true' EXIT
docker run -d --network none --name "$container_name" -e POSTGRES_PASSWORD=local-test-only "$image" >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container_name" mkdir /proof
docker cp "$task_root/tests" "$container_name:/proof/tests"
docker cp "$task_root/supabase" "$container_name:/proof/supabase"
psql_local() { docker exec -i -w /proof "$container_name" psql -U postgres -X -v ON_ERROR_STOP=1 -q "$@"; }
psql_local -f tests/issue-646-renuncia.pg.sql
if psql_local -f supabase/rollback/20261002180000_vocabulario_situacao_renuncia.rollback.sql >/dev/null 2>&1; then
  echo 'FAIL: rollback accepted renuncia observations still in use'; exit 1
fi
# Retificação só no banco de teste: conserva o evento verificado anterior.
psql_local <<'SQL'
SET ROLE service_role;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM public.verified_candidate_observations WHERE field='situacao' AND value='renuncia' LOOP
    ASSERT public.observe_verified_candidate_change(r.candidate_id,r.field,r.year,'deferido',r.source_url,r.source_identity) = 'changed';
  END LOOP;
END $$;
RESET ROLE;
SQL
psql_local -f supabase/rollback/20261002180000_vocabulario_situacao_renuncia.rollback.sql
psql_local <<'SQL'
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.verified_candidate_updates WHERE after_value='renuncia'), 'history was erased';
  BEGIN
    PERFORM public.observe_verified_candidate_change('00000000-0000-0000-0000-000000000001','situacao',2026,'renuncia','https://tse.jus.br','rollback');
    RAISE EXCEPTION 'rollback RPC still accepts renuncia';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT 'ISSUE646_RPC_ROLLBACK_HISTORY_PRESERVED_PASS' AS status;
SQL
