#!/usr/bin/env bash
# Prova local das migrations de recibos de sites e situação TSE 2026 em PG17.
# Nunca conecta em produção. O CHECK gerencia Colima e remove container/arquivos.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
SITES=20260924204852
SITUACAO=20260924205031
SITES_M="supabase/migrations/${SITES}_sites_tse_2026_receipts.sql"
SITUACAO_M="supabase/migrations/${SITUACAO}_situacao_tse_2026_receipts.sql"
SITES_R="supabase/readback/${SITES}_sites_tse_2026_receipts.readback.sql"
SITUACAO_R="supabase/readback/${SITUACAO}_situacao_tse_2026_receipts.readback.sql"
SITES_B="supabase/rollback/${SITES}_sites_tse_2026_receipts.rollback.sql"
SITUACAO_B="supabase/rollback/${SITUACAO}_situacao_tse_2026_receipts.rollback.sql"
for f in "$SITES_M" "$SITUACAO_M" "$SITES_R" "$SITUACAO_R" "$SITES_B" "$SITUACAO_B"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

[[ -n "${TMPDIR:-}" && -d "$TMPDIR" ]] || { echo "FAIL: defina TMPDIR privado existente para o scratch" >&2; exit 2; }
umask 077
WORK="$(mktemp -d "$TMPDIR/pf-coleta-receipts-pg17.XXXXXX")"
CONTAINER="pf-coleta-receipts-pg17-$$"
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [[ -n "$CONTAINER" ]]; then docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; fi
  colima stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit "$rc"
}
trap cleanup EXIT INT TERM
fail() { echo "FAIL: $*" >&2; exit 1; }

if ! colima status >/dev/null 2>&1; then
  colima start --runtime docker || fail "não foi possível iniciar Colima"
fi
command -v docker >/dev/null || fail "docker indisponível"
docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "imagem $IMAGE não está em cache local; script não fará pull"
docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE" >/dev/null || fail "container PostgreSQL 17"
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 || fail "PostgreSQL não ficou pronto"
sql() { docker exec -i "$CONTAINER" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; }
createdb() { docker exec "$CONTAINER" createdb -U postgres "$1"; }

# Extrai os manifests imutáveis das migrations para criar a coorte mínima exata.
python3 - "$SITES_M" "$SITUACAO_M" > "$WORK/seed.sql" <<'PY'
import json, pathlib, re, sys
sites, situation = [pathlib.Path(p).read_text() for p in sys.argv[1:]]
def payload(text, variable, tag):
    m = re.search(rf'\b{variable} jsonb\s*:=\s*\${tag}\$(.*?)\${tag}\$::jsonb', text, re.S)
    if not m:
        raise SystemExit(f"manifesto {variable}/{tag} ausente")
    return json.loads(m.group(1))
a = payload(sites, 'expected', 'dataset')
b = payload(situation, 'cohort', 'cohort')
changes = payload(situation, 'changes', 'changes')
if len(a) != 513 or len(b) != 513 or len(changes) != 19:
    raise SystemExit('manifestos fora das contagens esperadas')
if {(x['slug'],x['sq']) for x in a} != {(x['slug'],x['sq']) for x in b}:
    raise SystemExit('manifestos sites/situacao não descrevem a mesma coorte')
def lit(s): return "'" + str(s).replace("'", "''") + "'"
print('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
print('CREATE TABLE public.candidatos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, sq_candidato_2026 text NOT NULL, status text NOT NULL, publicavel boolean NOT NULL, situacao_candidatura text);')
print('CREATE TABLE public.coleta_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, fonte text NOT NULL, escopo text, alvo text, candidato_id uuid, executado_em timestamptz, resultado text, volume integer, detalhe text, url text, execucao text, natureza text);')
print('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);')
print('CREATE TABLE public.expected_situacao (slug text, sq text, before text, after text, PRIMARY KEY(slug,sq));')
print('INSERT INTO public.expected_situacao VALUES')
print(',\n'.join(f"({lit(x['slug'])},{lit(x['sq'])},{lit(x['before'])},{lit(x['after'])})" for x in changes) + ';')
print('INSERT INTO public.candidatos(slug,sq_candidato_2026,status,publicavel,situacao_candidatura) VALUES')
print(',\n'.join(f"({lit(x['slug'])},{lit(x['sq'])},'candidato',true,'aguardando julgamento')" for x in a) + ';')
print('UPDATE public.candidatos c SET situacao_candidatura=v.before FROM (VALUES')
print(',\n'.join(f"({lit(x['slug'])},{lit(x['sq'])},{lit(x['before'])})" for x in changes) + ') AS v(slug,sq,before) WHERE c.slug=v.slug AND c.sq_candidato_2026=v.sq;')
PY
[[ -s "$WORK/seed.sql" ]] || fail "semeadura dos manifests"

bootstrap() {
  local db="$1"
  createdb "$db"
  sql "$db" < "$WORK/seed.sql" || fail "semeadura em $db"
}
expect_reject() {
  local db="$1" label="$2" file="$3" expected="$4" output
  if output="$(sql "$db" -f - < "$file" 2>&1)"; then fail "$label deveria abortar"; fi
  grep -qF "$expected" <<<"$output" || fail "$label abortou por causa inesperada: $(grep -m1 'ERROR:' <<<"$output" || true)"
}

expect_tamper_rejected() {
  local db="$1" execution="$2" readback="$3" expected_error="$4" output
  {
    printf 'BEGIN;\n'
    printf "UPDATE coleta_log SET detalhe=jsonb_set(detalhe::jsonb, '{resource_sha256}', to_jsonb('tampered'::text)) WHERE id=(SELECT min(id) FROM coleta_log WHERE execucao='%s');\n" "$execution"
    cat "$readback"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$CONTAINER" psql -X -U postgres -d "$db" -v ON_ERROR_STOP=0 -q >"$WORK/tamper.out" 2>&1 || true
  output="$(cat "$WORK/tamper.out")"
  grep -q 'ERROR:' <<<"$output" || fail "readback aceitou recibo adulterado: $execution"
  grep -qF "$expected_error" <<<"$output" || fail "readback falhou por motivo diferente do hash de fonte adulterado: $execution"
  [[ "$(sql "$db" -Atc "SELECT count(*) FROM coleta_log WHERE execucao='$execution' AND detalhe::jsonb->>'resource_sha256'='tampered'")" == 0 ]] || fail "adulteração não foi revertida: $execution"
}

# Caminho principal: migrations na ordem local, sem pf.replay, readbacks e
# rollbacks em ordem reversa com prova de estado após cada etapa.
bootstrap success
sql success < "$SITES_M" || fail "migration de sites"
sql success < "$SITES_R" || fail "readback de sites"
expect_tamper_rejected success "migration:$SITES" "$SITES_R" 'identidade, escopo ou fonte divergiu'
[[ "$(sql success -Atc "SELECT count(*) FROM coleta_log WHERE execucao='migration:$SITES' AND fonte='sites-tse'")" == 513 ]] || fail "não há 513 recibos sites"
sql success < "$SITUACAO_M" || fail "migration de situação"
sql success < "$SITUACAO_R" || fail "readback de situação"
expect_tamper_rejected success "migration:$SITUACAO" "$SITUACAO_R" 'identidade, motivo ou fonte divergiu'
[[ "$(sql success -Atc "SELECT count(*) FROM coleta_log WHERE execucao='migration:$SITUACAO' AND fonte='tse-situacao'")" == 513 ]] || fail "não há 513 recibos situação"
[[ "$(sql success -Atc "SELECT count(*) FROM expected_situacao e JOIN candidatos c ON c.slug=e.slug AND c.sq_candidato_2026=e.sq AND c.situacao_candidatura=e.after")" == 19 ]] || fail "as 19 situações exatas não foram aplicadas"
expect_reject success "reaplicação sites" "$SITES_M" 'recibos ja existem'
expect_reject success "reaplicação situação" "$SITUACAO_M" 'preimagem de situacao divergente'
[[ "$(sql success -Atc "SELECT count(*) FROM coleta_log WHERE execucao='migration:$SITUACAO'")" == 513 ]] || fail "reaplicação situação deixou recibos parciais"
[[ "$(sql success -Atc "SELECT count(*) FROM candidatos WHERE slug='tse-2026-100002553336' AND situacao_candidatura='indeferido com recurso'")" == 1 ]] || fail "reaplicação situação alterou parcialmente os alvos"
sql success < "$SITUACAO_B" || fail "rollback de situação"
[[ "$(sql success -Atc "SELECT count(*) FROM coleta_log WHERE execucao='migration:$SITUACAO'")" == 0 ]] || fail "rollback de situação deixou recibos"
[[ "$(sql success -Atc "SELECT count(*) FROM expected_situacao e JOIN candidatos c ON c.slug=e.slug AND c.sq_candidato_2026=e.sq AND c.situacao_candidatura=e.before")" == 19 ]] || fail "rollback não restaurou as 19 pré-imagens exatas"
sql success < "$SITES_B" || fail "rollback de sites"
[[ "$(sql success -Atc "SELECT count(*) FROM coleta_log WHERE execucao IN ('migration:$SITES','migration:$SITUACAO')")" == 0 ]] || fail "rollback deixou recibos"

# Coorte divergente deve abortar atomicamente antes de criar recibos.
bootstrap divergent
sql divergent -c "UPDATE candidatos SET sq_candidato_2026='999999999' WHERE slug='acm-neto'" || fail "fixture divergente"
expect_reject divergent "coorte divergente sites" "$SITES_M" 'coorte ou SQ divergente'
expect_reject divergent "coorte divergente situação" "$SITUACAO_M" 'identidade/coorte divergente'
[[ "$(sql divergent -Atc 'SELECT count(*) FROM coleta_log')" == 0 ]] || fail "coorte divergente deixou escrita parcial"
[[ "$(sql divergent -Atc "SELECT count(*) FROM candidatos WHERE slug='tse-2026-100002553336' AND situacao_candidatura='aguardando julgamento'")" == 1 ]] || fail "coorte divergente alterou candidato"

# Recibo preexistente na execução exata deve bloquear a migration inteira.
bootstrap existing
sql existing -c "INSERT INTO coleta_log(fonte,alvo,execucao) VALUES ('sites-tse','acm-neto','migration:$SITES')" || fail "fixture de recibo existente"
expect_reject existing "recibo sites preexistente" "$SITES_M" 'recibos ja existem'
[[ "$(sql existing -Atc "SELECT count(*) FROM coleta_log WHERE execucao='migration:$SITES'")" == 1 ]] || fail "tentativa alterou recibo preexistente"
bootstrap existing_situation
sql existing_situation -c "INSERT INTO coleta_log(fonte,alvo,execucao) VALUES ('tse-situacao','acm-neto','migration:$SITUACAO')" || fail "fixture de recibo situação existente"
expect_reject existing_situation "recibo situação preexistente" "$SITUACAO_M" 'recibos ja existem'
[[ "$(sql existing_situation -Atc "SELECT count(*) FROM coleta_log WHERE execucao='migration:$SITUACAO'")" == 1 ]] || fail "tentativa alterou recibo situação preexistente"
[[ "$(sql existing_situation -Atc "SELECT count(*) FROM expected_situacao e JOIN candidatos c ON c.slug=e.slug AND c.sq_candidato_2026=e.sq AND c.situacao_candidatura=e.before")" == 19 ]] || fail "recibo situação preexistente causou escrita parcial"

# A ordem e a ausência de pf.replay são parte da prova: ambos os recibos
# passam pelos readbacks SQL oficiais antes dos rollbacks correspondentes.
echo "PASS: PG17 local provou 513 recibos sites, 513 recibos situação e as 19 atualizações exatas; abortos por coorte divergente, recibo existente e reaplicação; readbacks e rollbacks correspondentes."
echo 'COLETA_FICHAS_RECEIPTS_PG17_PASS'
