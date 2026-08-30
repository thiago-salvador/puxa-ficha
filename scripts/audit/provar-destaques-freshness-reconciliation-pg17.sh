#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260830151500"
MIGRATION="supabase/migrations/${VERSION}_destaques_freshness_reconciliation.sql"
READBACK="supabase/readback/${VERSION}_destaques_freshness_reconciliation.readback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_destaques_freshness_reconciliation.rollback.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_destaques_freshness_reconciliation.rollback.sql"
FIXTURE="QA/evidencias/2026-08-30-destaques-votacoes/migration-fixture.sql"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"

cleanup() {
  docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() {
  docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

q -q < "$FIXTURE"
before_pairs_digest="$(q -Atq -c "SELECT md5(string_agg(row_to_json(v)::text,'' ORDER BY v.id)) FROM public.votos_candidato v")"

rollback_initial="$(q -Atq < "$ROLLBACK_READBACK")"
[[ "$rollback_initial" == "154|0|181|5" ]] || {
  echo "FAIL: rollback readback não reconheceu o pré-estado $rollback_initial" >&2
  exit 1
}

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou estado anterior" >&2
  exit 1
fi

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
result="$(q -Atq < "$READBACK")"
[[ "$result" == "152|155|181|3|2" ]] || {
  echo "FAIL: readback inesperado $result" >&2
  exit 1
}
if q -q < "$ROLLBACK_READBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback readback aceitou o estado forward" >&2
  exit 1
fi

snapshot_json="$(q -Atq < scripts/audit/data-freshness-snapshot.sql)"
snapshot_state="$(jq -r '
  .collection_evidence
  | map(select(.source_id == "destaques-votacoes"))
  | max_by(.checked_at)
  | [
      .provenance_contract_version,
      .provenance_complete,
      .evidence_sha256,
      .raw_payload_count,
      .pair_count,
      (.double_read_execution_ids | length),
      .debt_count,
      .total_count
    ]
  | map(tostring)
  | join("|")
' <<< "$snapshot_json")"
[[ "$snapshot_state" == "1|true|0f8dd668625c620f4fee22439c8c450c2f92edb18e6edd5e0d49faed9ea5751f|93|154|2|0|155" ]] || {
  echo "FAIL: snapshot strict inesperado $snapshot_state" >&2
  exit 1
}

q -q -c "UPDATE public.coleta_log SET detalhe=detalhe||' adulterado' WHERE id=(SELECT min(id) FROM public.coleta_log WHERE execucao='migration:$VERSION' AND escopo='candidato')"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou recibo adulterado" >&2
  exit 1
fi
q -q -c "UPDATE public.coleta_log SET detalhe=left(detalhe,length(detalhe)-11) WHERE id=(SELECT min(id) FROM public.coleta_log WHERE execucao='migration:$VERSION' AND escopo='candidato')"

q -q -c "UPDATE public.votos_candidato SET voto='curadoria-posterior' WHERE candidato_id='ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid AND votacao_id='274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou par posterior" >&2
  exit 1
fi
q -q -c "UPDATE public.votos_candidato SET voto='artigo_17' WHERE candidato_id='ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid AND votacao_id='274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid"

q -q < "$ROLLBACK"
rollback_result="$(q -Atq < "$ROLLBACK_READBACK")"
[[ "$rollback_result" == "154|0|181|5" ]] || {
  echo "FAIL: rollback readback inesperado $rollback_result" >&2
  exit 1
}
after_pairs_digest="$(q -Atq -c "SELECT md5(string_agg(row_to_json(v)::text,'' ORDER BY v.id)) FROM public.votos_candidato v")"
[[ "$after_pairs_digest" == "$before_pairs_digest" ]] || {
  echo "FAIL: rollback não restaurou votos_candidato byte a byte" >&2
  exit 1
}
[[ "$(q -Atq -c 'SELECT count(*) FROM public.votos_candidato')" == "154" ]]
[[ "$(q -Atq -c "SELECT count(*) FROM public.coleta_log WHERE fonte='destaques-votacoes'")" == "181" ]]
[[ "$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSION'")" == "0" ]]
[[ "$(q -Atq -c "SELECT count(*) FROM public.votacoes_chave WHERE id IN ('e87490ab-2d4a-48ae-b3f8-dcaf2a171ed4','c7a9aef3-9943-47c7-8c30-9659626bace8','6a6407e5-6164-452b-acc3-bf173ed73e7f') AND fonte IS NULL AND votacao_id_api IS NULL")" == "3" ]]

echo "PASS: 154 pares, 155 recibos, 181 históricos, snapshot strict, rollback byte a byte e dois readbacks fail-closed em PostgreSQL 17"
