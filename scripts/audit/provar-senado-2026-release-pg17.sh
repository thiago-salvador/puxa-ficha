#!/usr/bin/env bash
# Prova local, em PostgreSQL 17 descartável, do release de schema do Senado 2026.
#
# 1. Replay do conjunto de schema sem as seis migrations do release.
# 2. Ledger sintético no topo de produção (20260912160200).
# 3. Aplica o SQL do gerador de produção transação a transação, com pg_dump
#    --schema-only depois de cada uma.
# 4. Reaplicação é recusada pelo CAS do ledger.
# 5. Rollbacks em ordem reversa: cada um recusa quando apagaria dado, depois
#    roda, passa no rollback readback e devolve exatamente o dump anterior.
# 6. Reaplica o conjunto inteiro e confere o dump final.
#
# Nunca conecta em produção: tudo roda via docker exec num container com nome
# único desta execução, removido no fim pelo trap do harness de replay.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1
# shellcheck source=scripts/audit/replay-migrations.sh
source "$ROOT/scripts/audit/replay-migrations.sh"
# Estado preenchido pelas funções do harness (subir_container, replay). Declarado
# aqui porque o scanner do contrato de env não segue `source` e trataria estes
# nomes como variáveis de ambiente não documentadas.
CONTAINER=""
R_APLICADAS=0

VERSIONS=(20260914000000 20260915090000 20260915190000 20260915210000 20260915210100 20260915220000)
FAKE_SHA="0000000000000000000000000000000000000000"
WORK="$(mktemp -d)"
trap 'cleanup; rm -rf "$WORK"' EXIT INT TERM

fail() { echo "FAIL: $*" >&2; exit 1; }
sql() { docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
sql_file() { sql -f - < "$1"; }
dump() {
  docker exec "$CONTAINER" pg_dump -U postgres -d postgres --schema-only \
    | grep -avE '^--|^SET |^SELECT pg_catalog\.set_config|^\\restrict|^\\unrestrict|^[[:space:]]*$' > "$1" \
    || fail "pg_dump falhou"
}
expect_refusal() {
  local file="$1" pattern="$2" out
  if out="$(sql_file "$file" 2>&1)"; then
    fail "$(basename "$file") deveria recusar ($pattern)"
  fi
  grep -q -- "$pattern" <<<"$out" || fail "$(basename "$file") falhou por outro motivo: $(grep -m1 ERROR <<<"$out")"
}

subir_container senado-release || fail "container"
bootstrap || fail "bootstrap"
lista="$(lista_por_filtro 'm["replaySchema"]')" || fail "classificador"
for v in "${VERSIONS[@]}"; do
  [[ "$(grep -c "^${v}_" <<<"$lista")" == 1 ]] || fail "$v fora do replay de schema"
done
base="$(grep -vE "^($(IFS='|'; echo "${VERSIONS[*]}"))_" <<<"$lista")"
replay "$base" 0
[[ ${#R_FALHAS[@]} -eq 0 ]] || fail "replay base: ${R_FALHAS[*]}"
echo "replay base : $R_APLICADAS migrations de schema aplicadas, 0 falhas"

sql <<'SQL' || fail "ledger sintético"
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text,
  created_by text, idempotency_key text, rollback text[]
);
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260912160200', 'grant_chapas_publico_columns');
INSERT INTO public.candidatos (id, nome_completo, nome_urna, slug, cargo_disputado, partido_atual, partido_sigla, publicavel)
VALUES ('00000000-0000-4000-8000-000000000001', 'Fixture Senado', 'FIXTURE', 'fixture-senado', 'Senador', 'Fixture', 'FIX', false);
SQL

args=("$FAKE_SHA")
for v in "${VERSIONS[@]}"; do
  m=(supabase/migrations/"${v}"_*.sql)
  [[ ${#m[@]} -eq 1 ]] || fail "migration duplicada ou ausente para $v"
  n="$(basename "${m[0]}" .sql)"
  args+=("$v" "${m[0]}" "supabase/rollback/$n.rollback.sql" "supabase/readback/$n.readback.sql")
done
python3 scripts/audit/lib/senado-2026-release-sql.py "${args[@]}" > "$WORK/release.sql" || fail "gerador"
# Quebra o SQL gerado nos blocos marcados: 6 transações + readback final.
python3 - "$WORK" <<'PY' || fail "split"
import pathlib, re, sys
work = pathlib.Path(sys.argv[1])
text = (work / "release.sql").read_text()
parts = re.split(r"(?m)^-- release senado 2026: ", text)
header, blocks = parts[0], parts[1:]
if len(blocks) != 7:
    raise SystemExit(f"esperava 7 blocos, veio {len(blocks)}")
for i, block in enumerate(blocks):
    (work / f"step{i}.sql").write_text(header + "-- " + block)
PY

dump "$WORK/d0"
for i in 0 1 2 3 4 5; do
  sql_file "$WORK/step$i.sql" > "$WORK/step$i.log" 2>&1 || { cat "$WORK/step$i.log" >&2; fail "aplicação ${VERSIONS[$i]}"; }
  dump "$WORK/d$((i + 1))"
  echo "aplicada    : ${VERSIONS[$i]} com readback"
done
sql_file "$WORK/step6.sql" > "$WORK/step6.log" 2>&1 || { cat "$WORK/step6.log" >&2; fail "readback final"; }
echo "readback    : final dos seis OK"
[[ "$(sql -Atc "select max(version) || '|' || count(*) from supabase_migrations.schema_migrations where version >= '20260914000000'")" == "20260915220000|6" ]] \
  || fail "ledger final"
[[ "$(sql -Atc "select count(*) from supabase_migrations.schema_migrations where created_by = 'github-actions:$FAKE_SHA' and idempotency_key like 'sha256:%' and array_length(statements,1) = 1 and array_length(rollback,1) = 1")" == 6 ]] \
  || fail "registro do ledger"

expect_refusal "$WORK/release.sql" "ledger divergiu sob lock antes de 20260914000000"
echo "reaplicação : recusada pelo CAS do ledger"

# O grant de sq_candidato_2026 depende do RLS de candidatos: o readback do
# roster precisa reprovar se o RLS cair ou se a policy deixar de exigir publicavel.
roster_readback="supabase/readback/$(basename supabase/migrations/20260914000000_*.sql .sql).readback.sql"
rls_probe() {
  # A mutação roda na mesma transação do readback e nunca é confirmada.
  local mutate="$1" pattern="$2" out
  if out="$( { printf 'BEGIN;\n%s\n' "$mutate"; sed -E 's/^(BEGIN|COMMIT);$//' "$roster_readback"; printf 'ROLLBACK;\n'; } | sql -f - 2>&1)"; then
    fail "readback do roster aceitou: $mutate"
  fi
  grep -q -- "$pattern" <<<"$out" || fail "readback do roster falhou por outro motivo: $(grep -m1 ERROR <<<"$out")"
}
rls_probe "ALTER TABLE public.candidatos DISABLE ROW LEVEL SECURITY;" "RLS de candidatos desabilitado"
rls_probe "ALTER POLICY \"Leitura pública\" ON public.candidatos USING (status <> 'removido');" "não exige publicavel = true"
rls_probe "CREATE POLICY fixture_aberta ON public.candidatos FOR SELECT TO anon USING (true);" "policy permissiva de leitura em candidatos sem publicavel"
rls_probe "UPDATE pg_constraint SET convalidated=false WHERE conrelid='public.candidatos'::regclass AND conname='candidatos_publicacao_minima_2026_check';" "sem Senador ou NOT VALID"
[[ "$(sql -Atc "select relrowsecurity from pg_class where oid='public.candidatos'::regclass")" == t ]] || fail "RLS de candidatos não restaurado"
[[ "$(sql -Atc "select convalidated from pg_constraint where conrelid='public.candidatos'::regclass and conname='candidatos_publicacao_minima_2026_check'")" == t ]] || fail "constraint de publicação mínima não está validada"
echo "readback RLS: reprova sem RLS, com policy sem publicavel e com policy aberta extra"
echo "readback constraint: reprova publicação mínima NOT VALID"

fixture_id="00000000-0000-4000-8000-000000000001"
block_rows=(
  "INSERT INTO public.senado_suplencias_2026 (ano, uf, chave_chapa, sq_coligacao, titular_candidato_id, titular_slug, titular_sq_candidato, ordem, sq_candidato, nome_urna, fonte_url, fonte_sha256) VALUES (2026,'SP','fixture','1','$fixture_id','fixture-senado','111',1,'222','FIXTURE','https://fixture.invalid',repeat('a',64))"
  "INSERT INTO public.financiamento_verificacoes (execucao, candidato_id, ano_eleicao, resultado, fonte_url, fonte_sha256, verificado_em, detalhe) VALUES ('fixture','$fixture_id',2018,'nao_aplicavel','https://fixture.invalid',repeat('a',64),now(),'fixture')"
  "INSERT INTO public.financiamento (candidato_id, ano_eleicao, cargo_candidatura) VALUES ('$fixture_id',2022,'Senador')"
  "INSERT INTO public.financiamento_verificacoes (execucao, candidato_id, ano_eleicao, resultado, cargo_candidatura) VALUES ('fixture','$fixture_id',2014,'nao_coletado','Senador')"
  "INSERT INTO public.historico_politico (candidato_id, cargo, proveniencia) VALUES ('$fixture_id','Senador','senado')"
  "INSERT INTO public.patrimonio (candidato_id, ano_eleicao, tipo_eleicao) VALUES ('$fixture_id',2022,'suplementar')"
)
clear_rows=(
  "DELETE FROM public.senado_suplencias_2026 WHERE chave_chapa='fixture'"
  "DELETE FROM public.financiamento_verificacoes WHERE execucao='fixture'"
  "DELETE FROM public.financiamento WHERE candidato_id='$fixture_id'"
  "DELETE FROM public.financiamento_verificacoes WHERE execucao='fixture'"
  "DELETE FROM public.historico_politico WHERE candidato_id='$fixture_id'"
  "DELETE FROM public.patrimonio WHERE candidato_id='$fixture_id'"
)
refusals=(
  "senado roster rollback recusado"
  "rollback nao_aplicavel bloqueado"
  "financiamento_cargo_candidatura rollback recusado"
  "financiamento_verificacoes_contexto rollback recusado"
  "historico_politico_proveniencia_senado rollback recusado"
  "patrimonio_contexto_eleitoral rollback recusado"
)
for i in 5 4 3 2 1 0; do
  v="${VERSIONS[$i]}"
  n="$(basename supabase/migrations/"${v}"_*.sql .sql)"
  sql -c "${block_rows[$i]}" || fail "fixture de recusa $v"
  expect_refusal "supabase/rollback/$n.rollback.sql" "${refusals[$i]}"
  sql -c "${clear_rows[$i]}" || fail "limpeza da fixture $v"
  sql_file "supabase/rollback/$n.rollback.sql" > "$WORK/rb$i.log" 2>&1 || { cat "$WORK/rb$i.log" >&2; fail "rollback $v"; }
  sql_file "supabase/readback/$n.rollback.readback.sql" > "$WORK/rbr$i.log" 2>&1 || { cat "$WORK/rbr$i.log" >&2; fail "rollback readback $v"; }
  dump "$WORK/r$i"
  if ! diff -u "$WORK/d$i" "$WORK/r$i" > "$WORK/rdiff$i"; then
    head -40 "$WORK/rdiff$i" >&2
    fail "rollback $v não devolveu o schema anterior"
  fi
  echo "rollback    : $v recusou dado, reverteu, readback OK, dump idêntico ao anterior"
done
[[ "$(sql -Atc "select max(version) from supabase_migrations.schema_migrations")" == "20260912160200" ]] || fail "ledger pós-rollback"

sql_file "$WORK/release.sql" > "$WORK/reapply.log" 2>&1 || { cat "$WORK/reapply.log" >&2; fail "reaplicação completa"; }
dump "$WORK/final"
diff -u "$WORK/d6" "$WORK/final" > "$WORK/fdiff" || { head -40 "$WORK/fdiff" >&2; fail "reaplicação divergiu do primeiro apply"; }
echo "reaplicação : seis migrations e readbacks OK após rollback; dump idêntico ao primeiro apply"
echo "PASS: release senado 2026 provado em PG17 descartável"
