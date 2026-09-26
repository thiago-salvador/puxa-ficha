#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável a quarentena ampliada 20260925221042 com o
# SQL impresso pelos próprios scripts de apply e rollback (modo print-sql):
# ensaio do apply desfaz tudo; apply marca as 68 linhas; readback e leitura
# anônima passam em sessões READ ONLY separadas; reaplicação e preimage
# adulterada são recusadas; rollback recusa migration posterior no topo;
# rollback devolve as linhas, tira a versão do ledger e não toca a quarentena
# anterior nem a linha de controle.
#
#   PF_PREVIOUS_VERSION=20260925220200 scripts/audit/provar-gastos-parlamentares-quarentena-universo-pg17.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${PF_PREVIOUS_VERSION:?informe a versão anterior no topo do ledger}"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
NAME="20260925221042_quarentena_gastos_parlamentares_universo"
APPLY="scripts/audit/apply-gastos-parlamentares-quarentena-universo-production.sh"
ROLLBACK="scripts/audit/rollback-gastos-parlamentares-quarentena-universo-production.sh"
TMP="$(mktemp -d)"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"

cleanup() {
  docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true
  rm -rf "$TMP"
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
  local rotulo="$1" arquivo="$2" padrao="$3"
  local saida
  if saida="$(q -q < "$arquivo" 2>&1)"; then
    echo "FAIL: $rotulo passou" >&2
    exit 1
  fi
  grep -q -- "$padrao" <<<"$saida" || { echo "FAIL: $rotulo falhou por outro motivo: $saida" >&2; exit 1; }
  echo "ok: $rotulo recusado"
}

contagens() {
  q -Atq -c "select count(*) filter (where despublicacao_motivo like 'gastos-universo:%' and despublicado_em is not null) || '|' || count(*) filter (where despublicado_em is null) || '|' || count(*) filter (where despublicacao_motivo like 'gastos-129:%' and despublicado_em is not null) || '|' || coalesce((select max(version) from supabase_migrations.schema_migrations), '') from public.gastos_parlamentares"
}

espera() {
  local rotulo="$1" esperado="$2" atual
  atual="$(contagens)"
  [[ "$atual" == "$esperado" ]] || { echo "FAIL: $rotulo: esperado $esperado, atual $atual" >&2; exit 1; }
  echo "ok: $rotulo ($atual)"
}

# Fixture mínima com o mesmo schema e a mesma policy de produção, as 68
# preimages extraídas da migration, uma linha de controle viva e uma linha da
# quarentena anterior.
python3 - "supabase/migrations/${NAME}.sql" "$PF_PREVIOUS_VERSION" > "$TMP/fixture.sql" <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
previous = sys.argv[2]
rows = re.findall(r"^\s*\('([0-9a-f-]{36})'::uuid, '([^']+)', (\d{4}), (\d+), '((?:[^']|'')*)'\)", s, re.M)
print("CREATE ROLE anon NOLOGIN;")
print("CREATE SCHEMA supabase_migrations;")
print("CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text);")
print(f"INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('{previous}', 'sha256:fixture');")
print("CREATE TABLE public.candidatos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE);")
print("CREATE FUNCTION public.is_public_candidate(uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT true';")
print("CREATE TABLE public.gastos_parlamentares (id uuid PRIMARY KEY, candidato_id uuid REFERENCES public.candidatos(id), ano int, total_gasto numeric, fonte text, despublicado_em timestamptz, despublicacao_motivo text, coletado_em timestamptz);")
print("ALTER TABLE public.gastos_parlamentares ENABLE ROW LEVEL SECURITY;")
print('CREATE POLICY "Leitura pública" ON public.gastos_parlamentares FOR SELECT USING (public.is_public_candidate(candidato_id) AND despublicado_em IS NULL);')
print("GRANT USAGE ON SCHEMA public TO anon; GRANT SELECT ON public.gastos_parlamentares TO anon; GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO anon;")
for slug in sorted({r[1] for r in rows} | {"controle-fora"}):
    print(f"INSERT INTO public.candidatos(slug) VALUES ('{slug}');")
for (i, slug, ano, cents, fonte) in rows:
    print(f"INSERT INTO public.gastos_parlamentares(id, candidato_id, ano, total_gasto, fonte) SELECT '{i}', id, {ano}, {cents}::numeric / 100, '{fonte}' FROM public.candidatos WHERE slug = '{slug}';")
print("INSERT INTO public.gastos_parlamentares(id, candidato_id, ano, total_gasto, fonte) SELECT gen_random_uuid(), id, 2020, 1000, 'Camara' FROM public.candidatos WHERE slug = 'controle-fora';")
print("INSERT INTO public.gastos_parlamentares(id, candidato_id, ano, total_gasto, fonte, despublicado_em, despublicacao_motivo) SELECT gen_random_uuid(), id, 2020, 5, 'Senado', now(), 'gastos-129: fixture' FROM public.candidatos WHERE slug = 'controle-fora';")
PY
q -q < "$TMP/fixture.sql"
espera "fixture" "0|69|1|$PF_PREVIOUS_VERSION"

bash "$APPLY" print-sql dry-run > "$TMP/apply-dry.sql"
bash "$APPLY" print-sql apply > "$TMP/apply.sql"
bash "$APPLY" print-anon-sql > "$TMP/anon.sql"
bash "$ROLLBACK" print-sql dry-run > "$TMP/rollback-dry.sql"
bash "$ROLLBACK" print-sql apply > "$TMP/rollback.sql"
{ echo 'BEGIN READ ONLY;'; cat "supabase/readback/${NAME}.readback.sql"; echo 'COMMIT;'; } > "$TMP/readback.sql"

falha_esperada "readback antes do apply" "$TMP/readback.sql" "quarentena ampliada incompleta"
falha_esperada "rollback antes do apply" "$TMP/rollback.sql" "ledger divergiu"

q -q < "$TMP/apply-dry.sql"
espera "ensaio do apply desfez tudo" "0|69|1|$PF_PREVIOUS_VERSION"

q -q < "$TMP/apply.sql"
espera "apply marcou as 68" "68|1|1|20260925221042"
q -q < "$TMP/readback.sql" && echo "ok: readback em sessão READ ONLY"
q -q < "$TMP/anon.sql" && echo "ok: anon não lê as 68 em sessão READ ONLY"
anon_linhas="$(q -Atq -c "BEGIN READ ONLY; SET LOCAL ROLE anon; SELECT count(*) FROM public.gastos_parlamentares; COMMIT;" | grep -E '^[0-9]+$')"
[[ "$anon_linhas" == "1" ]] || { echo "FAIL: anon deveria ler só a linha de controle, leu $anon_linhas" >&2; exit 1; }
echo "ok: anon lê só a linha de controle"
# Negativo: se a policy deixar de filtrar despublicado_em, a checagem anon reprova.
q -q -c 'ALTER POLICY "Leitura pública" ON public.gastos_parlamentares USING (public.is_public_candidate(candidato_id))'
falha_esperada "checagem anon com policy vazando" "$TMP/anon.sql" "anon ainda lê linha em quarentena"
q -q -c 'ALTER POLICY "Leitura pública" ON public.gastos_parlamentares USING (public.is_public_candidate(candidato_id) AND despublicado_em IS NULL)'

falha_esperada "reaplicação" "$TMP/apply.sql" "ledger divergiu sob lock"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20991231000000')"
falha_esperada "rollback com migration posterior no topo" "$TMP/rollback.sql" "ledger divergiu sob lock"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version = '20991231000000'"

q -q < "$TMP/rollback-dry.sql"
espera "ensaio do rollback desfez tudo" "68|1|1|20260925221042"
q -q < "$TMP/rollback.sql"
espera "rollback devolveu as 68 e tirou a versão do ledger" "0|69|1|$PF_PREVIOUS_VERSION"

# Preimage adulterada: a migration recusa quando um total muda.
q -q -c "UPDATE public.gastos_parlamentares SET total_gasto = total_gasto + 1 WHERE id = (SELECT id FROM public.gastos_parlamentares WHERE despublicado_em IS NULL AND ano <> 2020 ORDER BY id LIMIT 1)"
falha_esperada "preimage adulterada" "$TMP/apply.sql" "preimage de gastos mudou: 67/68"
espera "nada gravado depois da recusa" "0|69|1|$PF_PREVIOUS_VERSION"

echo "PROVA-OK: quarentena ampliada de gastos"
