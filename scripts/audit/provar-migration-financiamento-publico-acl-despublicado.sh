#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="pf-fin-public-acl-$$"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
FORWARD="$ROOT/supabase/migrations/20260812123000_financiamento_publico_acl_despublicado.sql"
READBACK="$ROOT/supabase/readback/20260812123000_financiamento_publico_acl_despublicado.readback.sql"
ROLLBACK="$ROOT/supabase/rollback/20260812123000_financiamento_publico_acl_despublicado.rollback.sql"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
ready=false
for _ in $(seq 1 120); do
  if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.25
done
if [[ "$ready" != true ]]; then
  docker logs "$CONTAINER" >&2 || true
  echo "FAIL: PostgreSQL 17 nao ficou pronto em 30 segundos" >&2
  exit 1
fi

psql_db() {
  local db="$1"
  shift
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"
}

file_db() {
  local db="$1"
  local file="$2"
  shift 2
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@" < "$file"
}

docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE DATABASE sem_categorias;
CREATE DATABASE com_categorias;
SQL

setup_db() {
  local db="$1"
  local categorias="$2"
  local sensiveis="$3"
  local extra_col=""
  local extra_select="NULL::jsonb AS categorias_origem"
  local extra_insert_cols=""
  local extra_insert_values=""
  local sensitive_cols=""
  local sensitive_insert_cols=""
  local sensitive_insert_values=""
  if [[ "$categorias" == "sim" ]]; then
    extra_col=", categorias_origem jsonb"
    extra_select="f.categorias_origem"
    extra_insert_cols=", categorias_origem"
    extra_insert_values=", '{\"TSE\":10}'::jsonb"
  fi
  if [[ "$sensiveis" == "sim" ]]; then
    sensitive_cols=$'  cpf_hash text,\n  cnpj_doador text,'
    sensitive_insert_cols=", cpf_hash, cnpj_doador"
    sensitive_insert_values=", 'segredo', 'segredo'"
  fi

  psql_db "$db" <<SQL
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20260811102000'), ('20260811102100');

CREATE TABLE public.financiamento (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL,
  ano_eleicao integer NOT NULL,
  total_arrecadado numeric NOT NULL,
  total_fundo_partidario numeric NOT NULL,
  total_fundo_eleitoral numeric NOT NULL,
  total_pessoa_fisica numeric NOT NULL,
  total_recursos_proprios numeric NOT NULL,
  maiores_doadores_publicos jsonb NOT NULL,
  fonte text NOT NULL,
  created_at timestamptz NOT NULL,
${sensitive_cols}
  despublicacao_motivo text,
  despublicado_em timestamptz
  $extra_col
);

CREATE FUNCTION public.is_public_candidate(uuid) RETURNS boolean
LANGUAGE sql IMMUTABLE AS 'SELECT true';

CREATE VIEW public.financiamento_publico WITH (security_invoker=true) AS
SELECT f.id, f.candidato_id, f.ano_eleicao, f.total_arrecadado,
       f.total_fundo_partidario, f.total_fundo_eleitoral, f.total_pessoa_fisica,
       f.total_recursos_proprios, f.maiores_doadores_publicos AS maiores_doadores,
       f.fonte, f.created_at, $extra_select
  FROM public.financiamento f
 WHERE public.is_public_candidate(f.candidato_id) AND f.despublicado_em IS NULL;

REVOKE ALL ON public.financiamento FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
  total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
  maiores_doadores_publicos, fonte, created_at
) ON public.financiamento TO anon, authenticated;
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;

INSERT INTO public.financiamento(
  id, candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
  total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
  maiores_doadores_publicos, fonte, created_at${sensitive_insert_cols},
  despublicacao_motivo, despublicado_em
  $extra_insert_cols
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  2026, 10, 1, 2, 3, 4, '[]'::jsonb, 'TSE', now()${sensitive_insert_values}, NULL, NULL
  $extra_insert_values
);
SQL
}

assert_public_fails() {
  local db="$1"
  if psql_db "$db" -c "SET ROLE anon; SELECT * FROM public.financiamento_publico LIMIT 1;" >/dev/null 2>&1; then
    echo "FAIL: $db deveria recusar a view antes do grant de despublicado_em" >&2
    exit 1
  fi
}

assert_sensitive_fails() {
  local db="$1"
  if psql_db "$db" -c "SET ROLE anon; SELECT cpf_hash, cnpj_doador FROM public.financiamento LIMIT 1;" >/dev/null 2>&1; then
    echo "FAIL: $db expos colunas sensiveis da tabela bruta" >&2
    exit 1
  fi
}

apply_forward() {
  local db="$1"
  { cat "$FORWARD"; printf "\nINSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260812123000');\n"; } |
    docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 --single-transaction -U postgres -d "$db" >/dev/null
}

for db in sem_categorias com_categorias; do
  if [[ "$db" == "com_categorias" ]]; then
    setup_db "$db" sim sim
  else
    setup_db "$db" nao nao
  fi
  assert_public_fails "$db"
  assert_sensitive_fails "$db"
  apply_forward "$db"
  file_db "$db" "$READBACK" --single-transaction >/dev/null
  psql_db "$db" -c "SET ROLE anon; SELECT * FROM public.financiamento_publico LIMIT 1; RESET ROLE;" >/dev/null
  psql_db "$db" -c "SET ROLE authenticated; SELECT * FROM public.financiamento_publico LIMIT 1; RESET ROLE;" >/dev/null
  assert_sensitive_fails "$db"
done
echo "PASS: view publica funciona com e sem categorias_origem; colunas sensiveis seguem negadas"

psql_db sem_categorias -c "GRANT SELECT (despublicacao_motivo) ON public.financiamento TO anon;" >/dev/null
if file_db sem_categorias "$READBACK" --single-transaction >/dev/null 2>&1; then
  echo "FAIL: readback aceitou grant adversarial" >&2
  exit 1
fi
psql_db sem_categorias -c "REVOKE SELECT (despublicacao_motivo) ON public.financiamento FROM anon;" >/dev/null

psql_db sem_categorias -c "REVOKE SELECT (despublicado_em) ON public.financiamento FROM anon;" >/dev/null
if file_db sem_categorias "$READBACK" --single-transaction >/dev/null 2>&1; then
  echo "FAIL: readback aceitou ausencia do grant necessario" >&2
  exit 1
fi
psql_db sem_categorias -c "GRANT SELECT (despublicado_em) ON public.financiamento TO anon;" >/dev/null
file_db sem_categorias "$READBACK" --single-transaction >/dev/null
echo "PASS: mutacoes adversariais de ACL abortam no readback"

# O readback exige a propria versao aplicada e NAO policia o topo do ledger.
# Cravar o topo aqui ja interrompeu a Fase 4 duas vezes sem defeito de dado, e
# enumerar topos aceitos so adia o problema. A identidade integral do ledger e
# conferida pelo runner da Fase 4, com audit:ledger:gate mais o par (total,topo)
# do release, que e onde essa assercao pertence.
for posterior in 20260812124000 20260812125000 29990101000000; do
  psql_db sem_categorias -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$posterior');" >/dev/null
  if ! file_db sem_categorias "$READBACK" --single-transaction >/dev/null 2>&1; then
    echo "FAIL: readback recusou o ledger com $posterior aplicada depois" >&2
    exit 1
  fi
done
psql_db sem_categorias -c "DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20260812124000','20260812125000','29990101000000');" >/dev/null

# O que ele CONTINUA recusando e a ausencia da propria versao.
psql_db sem_categorias -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260812123000';" >/dev/null
if file_db sem_categorias "$READBACK" --single-transaction >/dev/null 2>&1; then
  echo "FAIL: readback aceitou ledger sem a propria versao" >&2
  exit 1
fi
psql_db sem_categorias -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260812123000');" >/dev/null
file_db sem_categorias "$READBACK" --single-transaction >/dev/null
echo "PASS: readback independe do topo e exige a propria versao no ledger"

for db in sem_categorias com_categorias; do
  file_db "$db" "$ROLLBACK" --single-transaction >/dev/null
  [[ "$(psql_db "$db" -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260812123000'")" == "0" ]]
  assert_public_fails "$db"
  assert_sensitive_fails "$db"
done
echo "PASS: rollback restaura o pre-estado sem apagar ou expor dados"

psql_db sem_categorias -c "GRANT SELECT (despublicacao_motivo) ON public.financiamento TO anon;" >/dev/null
if apply_forward sem_categorias >/dev/null 2>&1; then
  echo "FAIL: forward aceitou pre-estado adversarial" >&2
  exit 1
fi
psql_db sem_categorias -c "REVOKE SELECT (despublicacao_motivo) ON public.financiamento FROM anon; DELETE FROM supabase_migrations.schema_migrations WHERE version='20260811102100';" >/dev/null
if apply_forward sem_categorias >/dev/null 2>&1; then
  echo "FAIL: forward aceitou ledger incompleto" >&2
  exit 1
fi
echo "PASS: forward recusa drift e dependencia ausente"

echo "PASS: migration 20260812123000 provada em PostgreSQL 17"
