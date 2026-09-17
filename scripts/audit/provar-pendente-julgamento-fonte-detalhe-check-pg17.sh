#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260917000000 (alarga
# chapas_2026_fonte_detalhe_check para 'Pendente de julgamento'), contra o
# schema REAL de chapas_2026 (todas as CHECK constraints de producao, lidas
# via pg_get_constraintdef em 17/09/2026), nao um fixture minimalista. Esta
# e parte da prova que faltou na PR #357: a de
# 20260916150000_refrescar_fonte_detalhe_prtb.sql so tinha
# chapas_2026_fonte_detalhe_check no fixture (nenhuma outra), entao nunca
# testou o dominio estreito de descricao_situacao -- o apply em producao
# (run 35179453431) violou a constraint real.
#
# DDL puro (schema): a migration nao escreve dado nenhum. A prova cobre
# no-op quando a constraint esta ausente, alargamento correto, dupla
# aplicacao idempotente, rollback restaurando o dominio estreito com guarda
# de dado (recusa se alguma chapa ja usa 'Pendente de julgamento'), e
# rollback duplicado recusado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260917000000"
MIGRATION="supabase/migrations/${VERSION}_ampliar_pendente_julgamento_fonte_detalhe_check.sql"
READBACK="supabase/readback/${VERSION}_ampliar_pendente_julgamento_fonte_detalhe_check.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_ampliar_pendente_julgamento_fonte_detalhe_check.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_ampliar_pendente_julgamento_fonte_detalhe_check.rollback.readback.sql"
REAL_SCHEMA="scripts/audit/lib/chapas-2026-real-schema.sql"
for f in "$MIGRATION" "$READBACK" "$ROLLBACK" "$ROLLBACK_READBACK" "$REAL_SCHEMA"; do
  [[ -f "$f" ]] || { echo "FAIL: artefato ausente: $f" >&2; exit 2; }
done

CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE")"
cleanup() { docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() { docker exec -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

M="$MIGRATION"

# 1) Tabela existe mas a constraint ainda nao (replay sintetico anterior a
# 20260907193000): no-op.
q -q -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);"
q -q -c "CREATE TABLE public.chapas_2026 (chave text PRIMARY KEY, fonte_tipo text NOT NULL DEFAULT 'legado')"
q -q < "$M"
vazio="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$vazio" == "0" ]] || { echo "FAIL: migration escreveu no ledger sem a constraint existir" >&2; exit 1; }

q -q -c "DROP TABLE public.chapas_2026"

# 2) Schema real, com a constraint estreita (estado real de producao antes
# desta PR). Forward alarga.
q -q < "$REAL_SCHEMA"
q -q <<'SQL'
ALTER TABLE public.chapas_2026 DROP CONSTRAINT chapas_2026_fonte_detalhe_check;
ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_fonte_detalhe_check
  CHECK (
    (fonte_tipo <> 'divulgacand_detalhe') OR ((
      jsonb_typeof(fonte_detalhe) = 'object'
      AND sq_coligacao IS NULL
      AND tse_situacao_titular_codigo IS NULL
      AND tse_situacao_vice_codigo IS NULL
      AND identidade_status = 'confirmada'
      AND vinculo_titular_status = ANY (ARRAY['confirmado', 'novo_perfil_oficial'])
      AND titular_candidato_id IS NOT NULL
      AND titular_sq_candidato ~ '^[0-9]+$'
      AND vice_sq_candidato ~ '^[0-9]+$'
      AND titular_sq_candidato <> vice_sq_candidato
      AND jsonb_array_length(alternativas_oficiais) = 0
      AND fonte_sha256 ~ '^[a-f0-9]{64}$'
      AND fonte_url = ('https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || COALESCE(uf, 'BR') || '/20322002026/candidato/' || titular_sq_candidato)
      AND (fonte_detalhe->'titular'->>'url') = fonte_url
      AND (fonte_detalhe->'titular'->>'sha256') = fonte_sha256
      AND (fonte_detalhe->'titular'->>'checked_at')::timestamptz = snapshot_em
      AND isfinite(snapshot_em)
      AND (fonte_detalhe->'titular'->>'http_status') = '200'
      AND (fonte_detalhe->'titular'->>'sq_candidato') = titular_sq_candidato
      AND (fonte_detalhe->'titular'->>'nome_completo') = titular_nome_completo
      AND (fonte_detalhe->'titular'->>'nome_urna') = titular_nome_urna
      AND (fonte_detalhe->'titular'->>'partido_sigla') = titular_partido_sigla
      AND (fonte_detalhe->'titular'->>'cargo') = cargo_titular
      AND (fonte_detalhe->'titular'->>'uf') = COALESCE(uf, 'BR')
      AND (fonte_detalhe->'titular'->>'descricao_situacao') = tse_situacao_codigo
      AND (fonte_detalhe->'titular'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso'])
      AND (fonte_detalhe->'titular'->>'vice_vigente_sq') = vice_sq_candidato
      AND (fonte_detalhe->'titular'->'contagem_vices_vigentes') = '1'::jsonb
      AND (fonte_detalhe->'titular'->'is_candidato_inapto') = 'false'::jsonb
      AND (fonte_detalhe->'titular'->'substituido') = 'false'::jsonb
      AND (fonte_detalhe->'vice'->>'url') = ('https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || COALESCE(uf, 'BR') || '/20322002026/candidato/' || vice_sq_candidato)
      AND (fonte_detalhe->'vice'->>'sha256') ~ '^[a-f0-9]{64}$'
      AND isfinite((fonte_detalhe->'vice'->>'checked_at')::timestamptz)
      AND (fonte_detalhe->'vice'->>'http_status') = '200'
      AND (fonte_detalhe->'vice'->>'sq_candidato') = vice_sq_candidato
      AND (fonte_detalhe->'vice'->>'nome_completo') = vice_nome_completo
      AND (fonte_detalhe->'vice'->>'nome_urna') = vice_nome_urna
      AND (fonte_detalhe->'vice'->>'partido_sigla') = vice_partido_sigla
      AND (fonte_detalhe->'vice'->>'cargo') = CASE cargo_titular WHEN 'Governador' THEN 'Vice-governador' ELSE 'Vice-presidente' END
      AND (fonte_detalhe->'vice'->>'uf') = COALESCE(uf, 'BR')
      AND (fonte_detalhe->'vice'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso'])
      AND (fonte_detalhe->'vice'->'is_candidato_inapto') = 'false'::jsonb
      AND (fonte_detalhe->'vice'->'substituido') = 'false'::jsonb
    ) IS TRUE)
  );
SQL
estreito_antes="$(q -Atq -c "SELECT pg_get_constraintdef(oid) LIKE '%Pendente de julgamento%' FROM pg_constraint WHERE conrelid='public.chapas_2026'::regclass AND conname='chapas_2026_fonte_detalhe_check'")"
[[ "$estreito_antes" == "f" ]] || { echo "FAIL: seed do teste ja teria o dominio largo" >&2; exit 1; }

q -q < "$M"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
q -q < "$READBACK"
dominio_largo="$(q -Atq -c "SELECT pg_get_constraintdef(oid) LIKE '%Pendente de julgamento%' FROM pg_constraint WHERE conrelid='public.chapas_2026'::regclass AND conname='chapas_2026_fonte_detalhe_check'")"
[[ "$dominio_largo" == "t" ]] || { echo "FAIL: dominio nao alargado apos forward" >&2; exit 1; }

# 3) Segunda aplicacao: idempotente (DROP+ADD de novo, sem falhar, sem
# gravar no ledger uma segunda vez).
q -q < "$M"
ledger_apos_repeticao="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSION'")"
[[ "$ledger_apos_repeticao" == "1" ]] || { echo "FAIL: migration nao e idempotente sobre o ledger" >&2; exit 1; }

# 4) Rollback recusa se alguma chapa ja usa o estado novo.
q -q -c "INSERT INTO public.candidatos (id, slug, sq_candidato_2026) VALUES ('9c1c0b1e-6e2b-4f0a-9f1a-000000000001','leonardo-avalanche','280002554479')"
q -q -c "INSERT INTO public.chapas_2026 (
  chave, eleicao_codigo, eleicao_data, uf, cargo_titular, sq_coligacao,
  identidade_status, vinculo_titular_status, tse_situacao_codigo,
  tipo_agremiacao, composicao, titular_candidato_id, titular_sq_candidato,
  vice_sq_candidato, titular_nome_completo, titular_nome_urna, titular_partido_sigla,
  vice_nome_completo, vice_nome_urna, vice_partido_sigla,
  fonte_url, fonte_sha256, snapshot_em, fonte_tipo, fonte_detalhe
) VALUES (
  '2026:BR:pablo-henrique-costa-marcal', '6259', '2026-10-04', NULL, 'Presidente', NULL,
  'confirmada', 'novo_perfil_oficial', 'Pendente de julgamento',
  'PARTIDO ISOLADO', 'PRTB', '9c1c0b1e-6e2b-4f0a-9f1a-000000000001', '280002554479',
  '280002554490', 'LEONARDO AVALANCHE', 'LEONARDO AVALANCHE', 'PRTB',
  'SILVIA', 'SILVIA', 'PRTB',
  'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479',
  '111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c',
  '2026-09-17T02:08:13.408Z', 'divulgacand_detalhe',
  '{\"titular\":{\"url\":\"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479\",\"sha256\":\"111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c\",\"checked_at\":\"2026-09-17T02:08:13.408Z\",\"http_status\":\"200\",\"sq_candidato\":\"280002554479\",\"nome_completo\":\"LEONARDO AVALANCHE\",\"nome_urna\":\"LEONARDO AVALANCHE\",\"partido_sigla\":\"PRTB\",\"cargo\":\"Presidente\",\"uf\":\"BR\",\"descricao_situacao\":\"Pendente de julgamento\",\"vice_vigente_sq\":\"280002554490\",\"contagem_vices_vigentes\":1,\"is_candidato_inapto\":false,\"substituido\":false},\"vice\":{\"url\":\"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554490\",\"sha256\":\"a8e4d5713cf8f2fe7ab354b48c52777b807c83437187aeed61ff28d8261e80f2\",\"checked_at\":\"2026-09-17T02:10:23.346Z\",\"http_status\":\"200\",\"sq_candidato\":\"280002554490\",\"nome_completo\":\"SILVIA\",\"nome_urna\":\"SILVIA\",\"partido_sigla\":\"PRTB\",\"cargo\":\"Vice-presidente\",\"uf\":\"BR\",\"descricao_situacao\":\"Pendente de julgamento\",\"is_candidato_inapto\":false,\"substituido\":false}}'::jsonb
)"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aplicou com chapa usando o estado novo" >&2; exit 1
fi
q -q -c "DELETE FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'"
q -q -c "DELETE FROM public.candidatos WHERE id='9c1c0b1e-6e2b-4f0a-9f1a-000000000001'"

# 5) Rollback limpo: restaura o dominio estreito.
q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"
dominio_apos_rollback="$(q -Atq -c "SELECT pg_get_constraintdef(oid) LIKE '%Pendente de julgamento%' FROM pg_constraint WHERE conrelid='public.chapas_2026'::regclass AND conname='chapas_2026_fonte_detalhe_check'")"
[[ "$dominio_apos_rollback" == "f" ]] || { echo "FAIL: rollback nao restaurou o dominio estreito" >&2; exit 1; }
ledger_apos_rollback="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='$VERSION'")"
[[ "$ledger_apos_rollback" == "0" ]] || { echo "FAIL: ledger apos rollback = $ledger_apos_rollback" >&2; exit 1; }

# 6) Rollback duplicado: recusa (constraint ja estreita, guard "CHECK ja e
# o estreito" ou ledger ausente).
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: segundo rollback nao foi recusado" >&2; exit 1
fi

echo "PASS: alargamento de chapas_2026_fonte_detalhe_check tem no-op sem a constraint, forward correto sobre o schema real, idempotencia, rollback recusado com dado usando o estado novo, rollback limpo restaurando o dominio estreito, e rollback duplicado recusado, provados em PostgreSQL 17 contra as CHECK constraints reais de chapas_2026"
