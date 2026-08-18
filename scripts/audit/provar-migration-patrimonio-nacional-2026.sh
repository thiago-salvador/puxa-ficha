#!/usr/bin/env bash
set -euo pipefail

IMAGE="${PF_REPLAY_POSTGRES_IMAGE:-postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317}"
CONTAINER="pf-patrimonio-nacional-$$"
MIGRATION="supabase/migrations/20260816055200_backfill_patrimonio_nacional_2026.sql"
RECEIPT="scripts/audit/recibo-patrimonio-nacional-20260816.json"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

q() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"
}

apply_migration() {
  q -f - <"$MIGRATION"
}

igual() {
  local nome="$1" atual="$2" esperado="$3"
  if [[ "$atual" != "$esperado" ]]; then
    echo "FAIL $nome: atual=$atual esperado=$esperado" >&2
    exit 1
  fi
  echo "PASS $nome"
}

fixtures() {
  local limite="${1:-all}"
  node - "$RECEIPT" "$limite" <<'NODE'
const fs = require("node:fs")
const [receiptPath, limit] = process.argv.slice(2)
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"))
const rows = limit === "partial" ? receipt.migration.slice(1) : receipt.migration
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`
console.log(
  `INSERT INTO public.candidatos(slug,cargo_disputado,estado,status,publicavel) VALUES\n${rows
    .map(
      (row) =>
        `(${literal(row.slug)},${literal(row.cargo)},${row.uf ? literal(row.uf) : "NULL"},'candidato',true)`,
    )
    .join(",\n")};`,
)
NODE
}

esperado() {
  node - "$RECEIPT" "$1" <<'NODE'
const fs = require("node:fs")
const receipt = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
const key = process.argv[3]
if (key === "soma") {
  const cents = receipt.migration.reduce((total, row) => total + row.totalCentavos, 0)
  console.log(`${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`)
} else {
  console.log(receipt.totais[key])
}
NODE
}

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  cargo_disputado text NOT NULL,
  estado text,
  status text NOT NULL,
  publicavel boolean NOT NULL
);
CREATE TABLE public.patrimonio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL,
  valor_total numeric NOT NULL,
  bens jsonb NOT NULL,
  fonte text NOT NULL,
  UNIQUE (candidato_id, ano_eleicao)
);
SQL

expected_rows="$(esperado linhasMigration)"
expected_assets="$(esperado bensMigration)"
expected_sum="$(esperado soma)"

echo "F1: coorte completa aplica todas as linhas e pós-condições."
fixtures all | q
apply_migration >/dev/null
igual "linhas" "$(q -c "SELECT count(*) FROM public.patrimonio WHERE ano_eleicao=2026")" "$expected_rows"
igual "bens" "$(q -c "SELECT sum(jsonb_array_length(bens)) FROM public.patrimonio WHERE ano_eleicao=2026")" "$expected_assets"
igual "soma" "$(q -c "SELECT sum(valor_total)::numeric(30,2) FROM public.patrimonio WHERE ano_eleicao=2026")" "$expected_sum"
hash_before="$(q -c "SELECT md5(string_agg(c.slug||'|'||p.valor_total||'|'||p.bens::text||'|'||p.fonte, E'\\n' ORDER BY c.slug)) FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id WHERE p.ano_eleicao=2026")"

echo "F2: replay real é byte-estável."
apply_migration >/dev/null
hash_after="$(q -c "SELECT md5(string_agg(c.slug||'|'||p.valor_total||'|'||p.bens::text||'|'||p.fonte, E'\\n' ORDER BY c.slug)) FROM public.patrimonio p JOIN public.candidatos c ON c.id=p.candidato_id WHERE p.ano_eleicao=2026")"
igual "hash replay" "$hash_after" "$hash_before"
igual "linhas replay" "$(q -c "SELECT count(*) FROM public.patrimonio")" "$expected_rows"

echo "F3: banco integrado com coorte parcial aborta antes de escrever."
q -c "TRUNCATE public.patrimonio, public.candidatos CASCADE; INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260815223000') ON CONFLICT DO NOTHING;"
fixtures partial | q
if apply_migration >/dev/null 2>&1; then
  echo "FAIL coorte parcial com ledger deveria abortar" >&2
  exit 1
fi
igual "rollback parcial" "$(q -c "SELECT count(*) FROM public.patrimonio")" "0"

echo "F4: replay parcial sem ledger é no-op e não grava."
q -c "TRUNCATE public.patrimonio, public.candidatos CASCADE; DROP SCHEMA supabase_migrations CASCADE;"
fixtures partial | q
apply_migration >/dev/null
igual "no-op parcial" "$(q -c "SELECT count(*) FROM public.patrimonio")" "0"

echo "PASS P-PATRIMONIO-NACIONAL harness completo"
