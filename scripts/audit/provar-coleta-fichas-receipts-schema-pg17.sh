#!/usr/bin/env bash
# Prova as migrations de recibos TSE em PostgreSQL 17 descartavel.
set -euo pipefail
cd "$(dirname "$0")/../.."

readonly IMAGE='postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317'
readonly SITES='20260924204852_sites_tse_2026_receipts'
readonly SITUACAO='20260924205031_situacao_tse_2026_receipts'
readonly MIGRATIONS=("supabase/migrations/${SITES}.sql" "supabase/migrations/${SITUACAO}.sql")
readonly READBACKS=("supabase/readback/${SITES}.readback.sql" "supabase/readback/${SITUACAO}.readback.sql")
readonly ROLLBACKS=("supabase/rollback/${SITUACAO}.rollback.sql" "supabase/rollback/${SITES}.rollback.sql")

umask 077
: "${TMPDIR:?configure TMPDIR apontando para uma pasta privada}"
PRIVATE_TMP="$(mktemp -d "${TMPDIR}/pf-coleta-receipts.XXXXXXXX")"
export TMPDIR="$PRIVATE_TMP"
# Variáveis preenchidas pelo harness carregado abaixo. Declará-las neste
# script mantém o contrato de ambiente explícito para o scanner do projeto.
CONTAINER=''
R_APLICADAS=0
R_PULADAS=0
# shellcheck source=scripts/audit/replay-migrations.sh
source scripts/audit/replay-migrations.sh
cleanup_proof() {
  local rc=$?
  trap - EXIT INT TERM
  cleanup || true
  colima stop >/dev/null 2>&1 || true
  rm -rf -- "$PRIVATE_TMP"
  exit "$rc"
}
trap cleanup_proof EXIT INT TERM
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

for file in "${MIGRATIONS[@]}" "${READBACKS[@]}" "${ROLLBACKS[@]}"; do
  [[ -s "$file" ]] || die "arquivo ausente/vazio: $file"
done
# This proof must use Colima, and the trap leaves it off even on failure.
command -v colima >/dev/null 2>&1 || die 'colima ausente'
if ! colima status >/dev/null 2>&1; then
  colima start --runtime docker || die 'Colima nao iniciou'
fi
[[ "$(docker context show)" == 'colima' ]] || die 'Docker nao aponta para Colima'
docker info >/dev/null 2>&1 || die 'Docker via Colima indisponivel'
# Never pull: require the replay harness's pinned image to be cached locally.
docker image inspect "$IMAGE" >/dev/null 2>&1 || die "imagem PG17 pinned nao esta em cache: $IMAGE"

lista_schema="$(lista_por_filtro 'm["replaySchema"]')" || die 'classificador de schema falhou'
subir_container coleta-fichas || die 'PostgreSQL 17 nao iniciou'
bootstrap || die 'bootstrap Supabase minimo falhou'
replay "$lista_schema" 0
[[ ${#R_FALHAS[@]} -eq 0 ]] || die "replay do schema falhou: ${R_FALHAS[*]}"
printf 'PASS schema replay: %s migrations DDL aplicadas, %s puladas\n' "$R_APLICADAS" "$R_PULADAS"
schema_dump="$(dump_schema)" || die 'pg_dump schema-only falhou'
schema_hash="$(printf '%s\n' "$schema_dump" | python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')"
expected_hash="$(python3 -c 'import json; print(json.load(open("scripts/audit/schema-replay-substituicoes.json"))["schema_dump_sha256"])')"
[[ "$schema_hash" == "$expected_hash" ]] || die "schema divergiu do gate oficial: esperado=$expected_hash medido=$schema_hash"
printf 'PASS schema SHA-256: %s\n' "$schema_hash"

psql_plain() { docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
assert_target_mode() {
  local value
  value="$(docker exec "$CONTAINER" psql -X -U postgres -d postgres -Atqc "select coalesce(current_setting('pf.replay', true), '<unset>')")"
  [[ "$value" == '<unset>' ]] || die "pf.replay contaminou conexao-alvo: $value"
}
psql_plain <<'SQL' || die 'objetos/constraints essenciais do schema real divergiram'
DO $$
DECLARE candidates oid := 'public.candidatos'::regclass;
        receipts oid := 'public.coleta_log'::regclass;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=candidates AND attname='sq_candidato_2026' AND NOT attisdropped)
 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=candidates AND attname='publicavel' AND NOT attisdropped)
 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=candidates AND attname='situacao_candidatura' AND NOT attisdropped)
 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=receipts AND attname='natureza' AND NOT attisdropped)
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=candidates AND conname='candidatos_publicacao_minima_2026_check')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=receipts AND conname='coleta_log_volume_coerente' AND convalidated)
 OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indrelid=candidates AND indisunique AND indpred IS NOT NULL
   AND pg_get_indexdef(indexrelid) ILIKE '%sq_candidato_2026%') THEN
   RAISE EXCEPTION 'schema: coluna/constraint/indice exigido ausente';
 END IF;
END $$;
SQL
printf 'PASS pg_catalog: colunas, publication/volume constraints e indice unico SQ\n'

# Seed only the required real-schema candidate columns. Identity, SQ, and each
# of the 19 before-values come from the exact target migration payloads.
python3 - "${MIGRATIONS[0]}" "${MIGRATIONS[1]}" "$PRIVATE_TMP/seed.sql" <<'PY'
import json, pathlib, re, sys
def payload(path, name):
    text = pathlib.Path(path).read_text(encoding='utf-8')
    m = re.search(r'\$'+name+r'\$(.*?)\$'+name+r'\$::jsonb', text, re.S)
    if not m: raise SystemExit(f'{path}: marcador {name} ausente')
    return json.loads(m.group(1))
sites = payload(sys.argv[1], 'dataset')
cohort = payload(sys.argv[2], 'cohort')
changes = payload(sys.argv[2], 'changes')
if len(sites)!=513 or len(cohort)!=513 or len(changes)!=19: raise SystemExit('contagens de coorte inesperadas')
if {(x['slug'],x['sq']) for x in sites}!={(x['slug'],x['sq']) for x in cohort}: raise SystemExit('identidades das migrations divergem')
before = {x['slug']:x['before'] for x in changes}
rows=[]
for x in cohort:
    vals=(x['slug'],x['sq'],before.get(x['slug'],'deferido'))
    rows.append('('+','.join("'"+v.replace("'","''").replace('\\','\\\\')+"'" for v in vals)+')')
sql = """BEGIN;
INSERT INTO public.candidatos
 (nome_completo,nome_urna,slug,partido_atual,partido_sigla,cargo_disputado,estado,status,
  situacao_candidatura,publicavel,fonte_dados,sq_candidato_2026,foto_url,biografia,
  naturalidade,data_nascimento,formacao,profissao_declarada,genero,estado_civil,cor_raca,
  verificacao_campos)
SELECT initcap(replace(v.slug,'-',' ')),initcap(replace(v.slug,'-',' ')),v.slug,
 'Partido de prova','PDP','Governador','SP','candidato',v.situacao,true,
 ARRAY['seed PG17 de teste'],v.sq,'https://example.invalid/foto',
 'seed sintetico PG17','Localidade sintetica',DATE '1990-01-01','Superior completo',
 'Profissao sintetica','Nao informado','Nao informado','Nao informado',
 '{"candidate_registration":{},"candidate_complement":{}}'::jsonb
FROM (VALUES
"""+',\n'.join(rows)+"""
) AS v(slug,sq,situacao);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.candidatos WHERE publicavel IS TRUE)<>513 THEN RAISE EXCEPTION 'seed: coorte divergiu'; END IF;
 IF (SELECT count(*) FROM public.candidatos WHERE sq_candidato_2026 IS NOT NULL)<>513 THEN RAISE EXCEPTION 'seed: SQ ausente'; END IF;
END $$;
COMMIT;
"""
pathlib.Path(sys.argv[3]).write_text(sql, encoding='utf-8')
expected=[]
for x in changes:
    vals=(x['slug'],x['sq'],x['before'])
    expected.append('('+','.join("'"+v.replace("'","''")+"'" for v in vals)+')')
check = """DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES
"""+',\n'.join(expected)+"""
 ) AS e(slug,sq,situacao) LEFT JOIN public.candidatos c ON c.slug=e.slug
 WHERE c.id IS NULL OR c.sq_candidato_2026 IS DISTINCT FROM e.sq
    OR c.situacao_candidatura IS DISTINCT FROM e.situacao) THEN
   RAISE EXCEPTION 'rollback preimage divergiu';
 END IF;
END $$;
"""
pathlib.Path(sys.argv[3]).with_name('assert-rollback.sql').write_text(check, encoding='utf-8')
PY
psql_plain < "$PRIVATE_TMP/seed.sql" || die 'seed falhou nas constraints reais de candidatos'

# Negative control for the harness-only bypass: explicitly run both migrations
# with pf.replay=true and prove no target receipts are written.
before="$(psql_plain -Atqc "select count(*) from public.coleta_log where execucao in ('migration:20260924204852','migration:20260924205031')")"
[[ "$before" == 0 ]] || die 'recibos inesperados antes do controle pf.replay'
for migration in "${MIGRATIONS[@]}"; do
  docker exec -e PGOPTIONS='-c pf.replay=true' -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f - < "$migration" || die "controle pf.replay falhou: $migration"
done
after="$(psql_plain -Atqc "select count(*) from public.coleta_log where execucao in ('migration:20260924204852','migration:20260924205031')")"
[[ "$after" == "$before" ]] || die 'controle pf.replay gravou recibos'
printf 'PASS controle pf.replay: migrations ignoradas\n'

assert_target_mode
psql_plain < "${MIGRATIONS[0]}" || die 'migration sites falhou sem pf.replay'
psql_plain < "${READBACKS[0]}" || die 'readback sites falhou'
printf 'PASS sites: readback PG17\n'
if rerun_error="$(psql_plain < "${MIGRATIONS[0]}" 2>&1)"; then
  die 'controle de reapply sites aceitou recibos duplicados'
fi
grep -q 'sites_tse_2026: recibos ja existem' <<<"$rerun_error" || die "reapply sites falhou pelo motivo errado: $rerun_error"
[[ "$(psql_plain -Atqc "select count(*) from public.coleta_log where execucao='migration:20260924204852'")" == 513 ]] || die 'reapply sites alterou os recibos existentes'
printf 'PASS controle reapply sites: bloqueou duplicidade\n'
assert_target_mode
psql_plain < "${MIGRATIONS[1]}" || die 'migration situacao falhou sem pf.replay'
psql_plain < "${READBACKS[1]}" || die 'readback situacao falhou'
printf 'PASS situacao: readback PG17\n'
if rerun_error="$(psql_plain < "${MIGRATIONS[1]}" 2>&1)"; then
  die 'controle de reapply situacao aceitou recibos duplicados'
fi
grep -q 'situacao_tse_2026: preimagem de situacao divergente' <<<"$rerun_error" || die "reapply situacao falhou pelo motivo errado: $rerun_error"
[[ "$(psql_plain -Atqc "select count(*) from public.coleta_log where execucao='migration:20260924205031'")" == 513 ]] || die 'reapply situacao alterou os recibos existentes'
printf 'PASS controle reapply situacao: bloqueou duplicidade\n'

# Reverse order and assert receipts are gone and all 19 preimages are restored.
for rollback in "${ROLLBACKS[@]}"; do
  psql_plain < "$rollback" || die "rollback falhou: $rollback"
done
psql_plain < "$PRIVATE_TMP/assert-rollback.sql" || die '19 preimagens exatas nao foram restauradas'
psql_plain <<'SQL' || die 'estado final apos rollback divergiu'
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao IN ('migration:20260924204852','migration:20260924205031')) THEN RAISE EXCEPTION 'recibos sobreviveram'; END IF;
 IF (SELECT count(*) FROM public.candidatos WHERE publicavel IS TRUE)<>513 THEN RAISE EXCEPTION 'coorte divergiu'; END IF;
END $$;
SQL
printf 'PASS rollback: recibos removidos, coorte preservada e 19 situações restauradas\n'
printf 'PASS prova PG17 concluida; o trap remove o container descartavel\n'
printf 'COLETA_FICHAS_RECEIPTS_SCHEMA_PG17_PASS\n'
