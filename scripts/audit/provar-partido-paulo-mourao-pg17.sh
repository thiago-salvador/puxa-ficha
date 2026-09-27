#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável a migration 20260926224500 (partido e
# cargo_atual de tse-2026-270002544629), sobre o schema real de candidatos e
# coleta_log (scripts/audit/lib/chapas-2026-real-schema.sql): readback reprova o
# pré-estado, a migration reprova preimagem adulterada (partido, cargo) e ficha
# despublicada sem deixar recibo, forward e readback, readback reprova
# postimagem adulterada, rollback recusa migration posterior no ledger, rollback
# com readback de rollback devolve o estado inicial e a sentinela fica intacta.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V="20260926224500_partido_cargo_paulo_mourao"
BASE="20260926190100"
REAL_SCHEMA="scripts/audit/lib/chapas-2026-real-schema.sql"
RUNNER="scripts/audit/apply-partido-paulo-mourao-production.sh"
for f in "supabase/migrations/$V.sql" "supabase/rollback/$V.rollback.sql" "supabase/readback/$V.readback.sql" \
         "supabase/readback/$V.rollback.readback.sql" "$REAL_SCHEMA" "$RUNNER"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

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

falha_esperada() {
  local rotulo="$1" arquivo="$2"
  if q -q < "$arquivo" >/dev/null 2>&1; then
    echo "FAIL: $rotulo" >&2
    exit 1
  fi
}

q -q < "$REAL_SCHEMA"
q -q <<SQL
CREATE TABLE public.identidade_timeline_quarentena_snapshot (
  migration_version text NOT NULL,
  tabela text NOT NULL CHECK (tabela = ANY (ARRAY['candidatos','historico_politico','mudancas_partido','patrimonio','financiamento','pontos_atencao','chapas_2026'])),
  row_id uuid NOT NULL,
  candidato_id uuid,
  preimage jsonb NOT NULL,
  postimage jsonb NOT NULL,
  registrado_em timestamptz NOT NULL,
  PRIMARY KEY (migration_version, tabela, row_id)
);
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('$BASE', 'sha256:fixture');
SQL
q -q <<'SQL'
INSERT INTO public.candidatos (id, slug, nome_completo, nome_urna, partido_atual, partido_sigla, cargo_disputado,
  cargo_atual, estado, status, publicavel, situacao_candidatura, sq_candidato_2026, foto_url, biografia, naturalidade,
  formacao, profissao_declarada, genero, estado_civil, cor_raca, data_nascimento, verificacao_campos, ultima_atualizacao) VALUES
  ('25c2ea11-3f6b-4124-8b5c-bcfa08c121ab','tse-2026-270002544629','PAULO SARDINHA MOURAO','PAULO MOURÃO','PSDB','PSDB','Senador',
   'Deputado(a) Federal','TO','candidato',true,'deferido','270002544629','https://example.test/p.jpg','bio','Cristalândia/TO',
   'Superior','Agropecuarista','Masculino','Casado(a)','Branca','1956-03-09','{"candidate_registration":{},"candidate_complement":{}}','2026-09-26T19:06:09.752Z'),
  -- sentinela: ex-deputado com o mesmo pré-estado em outra UF
  ('00000000-0000-4000-8000-0000000000b1','sentinela-sen','SENTINELA','SENTINELA','PSDB','PSDB','Senador',
   'Deputado(a) Federal','GO','candidato',true,'deferido','90009999999','https://example.test/s.jpg','bio','Goiânia/GO',
   'Superior','Outra','Feminino','Casado(a)','Branca','1960-01-01','{"candidate_registration":{},"candidate_complement":{}}','2026-09-26T19:06:09.752Z');
SQL

digest_tudo() {
  q -Atq -c "SELECT md5(string_agg(to_jsonb(c)::text,'' ORDER BY c.id)) FROM public.candidatos c"
}
digest_sentinela() {
  q -Atq -c "SELECT md5(string_agg(to_jsonb(c)::text,'' ORDER BY c.id)) FROM public.candidatos c WHERE c.slug <> 'tse-2026-270002544629'"
}
tudo_antes="$(digest_tudo)"
sentinela_antes="$(digest_sentinela)"

# Leitura do ledger pelo trecho real do runner, com a versão ainda não aplicada:
# a consulta devolve idempotency_key vazio no fim da linha.
ledger_runner() {
  local cols="coalesce(max(version),'')"
  for v in "$BASE" 20260926224500; do
    cols+=" || '|' || count(*) filter (where version='$v') || '|' || coalesce(max(idempotency_key) filter (where version='$v'),'')"
  done
  q -Atq -F '|' -c "select $cols from supabase_migrations.schema_migrations"
}
trecho_leitura="$(awk '/^# read -a descarta campos vazios/{f=1} /^if \[\[ "\$aplicadas" == "\$\{#versions\[@\]\}" \]\]/{f=0} f' "$RUNNER")"
[[ -n "$trecho_leitura" ]] || { echo "FAIL: trecho de leitura do ledger não encontrado no runner" >&2; exit 1; }
programa_leitura="$(mktemp)"
{
  printf '%s\n' 'set -euo pipefail' 'versions=(20260926224500)' 'digests=(sha256:d0)'
  printf 'estado=%q\n' "$(ledger_runner)"
  printf '%s\n' "$trecho_leitura"
  # shellcheck disable=SC2016 # expansão acontece no programa gerado, não aqui
  printf '%s\n' 'echo "$topo $aplicadas"'
} > "$programa_leitura"
leitura="$(bash "$programa_leitura")" || { echo "FAIL: runner não leu o ledger com a versão não aplicada" >&2; exit 1; }
rm -f "$programa_leitura"
[[ "$leitura" == "$BASE 0" ]] || { echo "FAIL: leitura do ledger inesperada: $leitura" >&2; exit 1; }

falha_esperada "readback aceitou o pré-estado" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.candidatos SET partido_sigla='PT' WHERE slug='tse-2026-270002544629'"
falha_esperada "migration aceitou partido fora da preimagem" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET partido_sigla='PSDB' WHERE slug='tse-2026-270002544629'"
q -q -c "UPDATE public.candidatos SET cargo_atual=NULL WHERE slug='tse-2026-270002544629'"
falha_esperada "migration aceitou cargo_atual fora da preimagem" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET cargo_atual='Deputado(a) Federal' WHERE slug='tse-2026-270002544629'"
q -q -c "UPDATE public.candidatos SET publicavel=false WHERE slug='tse-2026-270002544629'"
falha_esperada "migration aceitou ficha despublicada" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET publicavel=true WHERE slug='tse-2026-270002544629'"

[[ "$(q -Atq -c "SELECT count(*) FROM public.coleta_log")" == "0" ]] || { echo "FAIL: tentativa abortada deixou recibo" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: tentativa abortada deixou snapshot" >&2; exit 1; }
[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: fixture mudou antes do forward" >&2; exit 1; }

q -q < "supabase/migrations/$V.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260926224500', 'sha256:fixture')"
q -q < "supabase/readback/$V.readback.sql"

estado="$(q -Atq -c "SELECT partido_sigla||':'||partido_atual||':'||coalesce(cargo_atual,'<nulo>')||':'||status||':'||publicavel||':'||formacao||':'||naturalidade||':'||to_char(ultima_atualizacao AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS') FROM public.candidatos WHERE slug='tse-2026-270002544629'")"
esperado="PT:PT:<nulo>:candidato:true:Superior:Cristalândia/TO:2026-09-26T22:45:00"
[[ "$estado" == "$esperado" ]] || { echo "FAIL: forward inesperado: $estado" >&2; exit 1; }
[[ "$(digest_sentinela)" == "$sentinela_antes" ]] || { echo "FAIL: forward tocou sentinela" >&2; exit 1; }
recibo="$(q -Atq -c "SELECT fonte||':'||volume||':'||natureza||':'||(detalhe::jsonb->'linhas'->0->'before'->>'partido_sigla')||'>'||(detalhe::jsonb->'linhas'->0->'after'->>'partido_sigla') FROM public.coleta_log WHERE execucao='migration:20260926224500'")"
[[ "$recibo" == "tse-consulta-cand-2026:1:escrita:PSDB>PT" ]] || { echo "FAIL: recibo inesperado: $recibo" >&2; exit 1; }

q -q -c "UPDATE public.candidatos SET partido_atual='Partido dos Trabalhadores' WHERE slug='tse-2026-270002544629'"
falha_esperada "readback aceitou partido_atual adulterado" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.candidatos SET partido_atual='PT' WHERE slug='tse-2026-270002544629'"
q -q -c "UPDATE public.candidatos SET formacao='Superior completo' WHERE slug='tse-2026-270002544629'"
falha_esperada "readback aceitou campo fora da allowlist alterado" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.candidatos SET formacao='Superior' WHERE slug='tse-2026-270002544629'"
q -q < "supabase/readback/$V.readback.sql"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260930000000', 'sha256:future')"
falha_esperada "rollback aceitou migration posterior" "supabase/rollback/$V.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"

q -q < "supabase/rollback/$V.rollback.sql"
q -q < "supabase/readback/$V.rollback.readback.sql"
falha_esperada "rollback repetido foi aceito" "supabase/rollback/$V.rollback.sql"

[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: rollback não devolveu o estado inicial" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT max(version) FROM supabase_migrations.schema_migrations")" == "$BASE" ]] || { echo "FAIL: ledger final" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: snapshot sobrou" >&2; exit 1; }

echo "PASS: partido e cargo_atual de tse-2026-270002544629 têm pré-estado, preimagem adulterada, ficha despublicada, forward, recibo, readback com adulteração e campo fora da allowlist, migration posterior, rollback, rollback repetido e sentinela provados em PostgreSQL 17"
