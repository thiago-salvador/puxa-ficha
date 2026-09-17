#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260917000100 (issue #340: admissao
# da ficha de GODEIRO LINHARESS, substituto oficial de Carlos Jararaca ao
# Governo do RN, com patrimonio 2026 e vinculo em chapas_2026), contra o
# schema REAL de chapas_2026/candidatos (todas as CHECK constraints de
# producao, mesmo arquivo compartilhado usado pelo provador do alargamento
# de pendente de julgamento). Esta migration nao toca fonte_detalhe nem
# tse_situacao_codigo (a chapa RN e fonte_tipo=legado), mas a prova ainda
# usa o schema real para nao repetir a licao do incidente de apply
# 35179453431: fixture sem as CHECK constraints reais nao prova nada.
#
# Prova: no-op em banco vazio, abort sem escrita parcial quando a preimagem
# de chapas_2026 diverge (vinculo ja preenchido), forward com pos-condicao
# completa (candidato, patrimonio, vinculo, gate de completude), segunda
# execucao recusada (colisao), rollback preservador (despublica candidato e
# patrimonio, desfaz o vinculo) com readback, e recusa de rollback
# duplicado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260917000100"
MIGRATION="supabase/migrations/${VERSION}_admitir_godeiro_linharess.sql"
READBACK="supabase/readback/${VERSION}_admitir_godeiro_linharess.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_admitir_godeiro_linharess.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_admitir_godeiro_linharess.rollback.readback.sql"
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

schema() { q -q < "$REAL_SCHEMA"; }

seed() {
q -q <<'SQL'
INSERT INTO public.chapas_2026 (
  id, chave, eleicao_codigo, eleicao_data, uf, cargo_titular, sq_coligacao,
  identidade_status, vinculo_titular_status, tse_situacao_codigo,
  tse_situacao_titular_codigo, tse_situacao_vice_codigo,
  tipo_agremiacao, composicao, titular_candidato_id, vice_candidato_id,
  titular_sq_candidato, vice_sq_candidato,
  titular_nome_completo, titular_nome_urna, titular_partido_sigla,
  vice_nome_completo, vice_nome_urna, vice_partido_sigla,
  fonte_url, fonte_sha256, snapshot_em, fonte_tipo
) VALUES (
  '250e9ca4-b101-4ec4-9835-bff18c596061', '2026:RN:carlos-alberto-de-almeida-cavalcante',
  '6259', '2026-10-04', 'RN', 'Governador', '200001801097',
  'confirmada', 'confirmado', '#NE',
  '-3', '-3',
  'PARTIDO ISOLADO', 'DC', NULL, NULL,
  '200002554482', '200002550224',
  'GLADYER LINHARES GODEIRO', 'GODEIRO LINHARESS', 'DC',
  'JULIO CESAR NEVES', 'PASTOR JÚLIO', 'DC',
  'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
  '444969d5c29e600857c0e5bd21a13f04cd70d5ee126c752703b0d50b6e288771',
  '2026-09-16T22:31:04Z', 'legado'
);
INSERT INTO public.chapas_2026 (
  id, chave, eleicao_codigo, eleicao_data, uf, cargo_titular, sq_coligacao,
  identidade_status, vinculo_titular_status, tse_situacao_codigo,
  tse_situacao_titular_codigo, tse_situacao_vice_codigo,
  tipo_agremiacao, composicao, titular_candidato_id, vice_candidato_id,
  titular_sq_candidato, vice_sq_candidato,
  titular_nome_completo, titular_nome_urna, titular_partido_sigla,
  vice_nome_completo, vice_nome_urna, vice_partido_sigla,
  fonte_url, fonte_sha256, snapshot_em, fonte_tipo
) VALUES (
  '00000000-0000-0000-0000-0000000000c0', 'controle',
  '6259', '2026-10-04', 'XX', 'Governador', '000000000001',
  'confirmada', 'confirmado', '#NE',
  '-3', '-3',
  'PARTIDO ISOLADO', 'XX', NULL, NULL,
  '000', '001',
  'CONTROLE', 'CONTROLE', 'XX',
  'CONTROLE VICE', 'CONTROLE VICE', 'XX',
  'https://example.test/fixture', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
  '2020-01-01T00:00:00Z', 'legado'
);
SQL
}

M="$MIGRATION"

# 1) Banco vazio (candidatos e chapa alvo ausentes): no-op, nao falha.
schema
q -q < "$M"
vazio="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$vazio" == "0" ]] || { echo "FAIL: migration escreveu no ledger em coorte vazia" >&2; exit 1; }

seed

# 2) Preimagem errada (vinculo ja preenchido): aborta sem escrita parcial.
q -q -c "INSERT INTO public.candidatos (id, slug, sq_candidato_2026) VALUES ('11111111-1111-1111-1111-111111111111','fixture-intruso','999999')"
q -q -c "UPDATE public.chapas_2026 SET titular_candidato_id='11111111-1111-1111-1111-111111111111' WHERE chave='2026:RN:carlos-alberto-de-almeida-cavalcante'"
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou com preimagem divergente" >&2; exit 1
fi
parcial="$(q -Atq -c "SELECT count(*) FROM public.coleta_log")"
[[ "$parcial" == "0" ]] || { echo "FAIL: escrita parcial sobrou apos abort de preimagem" >&2; exit 1; }
q -q -c "UPDATE public.chapas_2026 SET titular_candidato_id=NULL WHERE chave='2026:RN:carlos-alberto-de-almeida-cavalcante'"
q -q -c "DELETE FROM public.candidatos WHERE id='11111111-1111-1111-1111-111111111111'"

# 3) Forward limpo.
q -q < "$M"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
q -q < "$READBACK"

candidato_ok="$(q -Atq -c "SELECT count(*) FROM public.candidatos WHERE slug='godeiro-linharess' AND publicavel=true AND situacao_candidatura='pendente de julgamento'")"
[[ "$candidato_ok" == "1" ]] || { echo "FAIL: candidato nao admitido corretamente ($candidato_ok)" >&2; exit 1; }
patrimonio_ok="$(q -Atq -c "SELECT count(*) FROM public.patrimonio WHERE sq_candidato='200002554482' AND valor_total=130000")"
[[ "$patrimonio_ok" == "1" ]] || { echo "FAIL: patrimonio nao gravado corretamente ($patrimonio_ok)" >&2; exit 1; }
vinculo_ok="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026 c JOIN public.candidatos x ON x.id=c.titular_candidato_id WHERE c.chave='2026:RN:carlos-alberto-de-almeida-cavalcante' AND x.slug='godeiro-linharess'")"
[[ "$vinculo_ok" == "1" ]] || { echo "FAIL: vinculo de chapas_2026 nao gravado ($vinculo_ok)" >&2; exit 1; }
controle_intacto="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026 WHERE chave='controle' AND titular_candidato_id IS NULL")"
[[ "$controle_intacto" == "1" ]] || { echo "FAIL: linha de controle foi tocada" >&2; exit 1; }

# 4) Segunda execucao: colisao, recusa.
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou de novo sobre estado ja admitido" >&2; exit 1
fi

# 5) Rollback preservador restaura o vinculo e despublica, sem apagar.
q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"
apos_rollback_candidato="$(q -Atq -c "SELECT publicavel::text||'|'||status FROM public.candidatos WHERE slug='godeiro-linharess'")"
[[ "$apos_rollback_candidato" == "false|removido" ]] || { echo "FAIL: rollback nao despublicou o candidato ($apos_rollback_candidato)" >&2; exit 1; }
apos_rollback_vinculo="$(q -Atq -c "SELECT titular_candidato_id IS NULL FROM public.chapas_2026 WHERE chave='2026:RN:carlos-alberto-de-almeida-cavalcante'")"
[[ "$apos_rollback_vinculo" == "t" ]] || { echo "FAIL: rollback nao desfez o vinculo de chapas_2026" >&2; exit 1; }
patrimonio_preservado="$(q -Atq -c "SELECT count(*) FROM public.patrimonio WHERE sq_candidato='200002554482' AND despublicado_em IS NOT NULL")"
[[ "$patrimonio_preservado" == "1" ]] || { echo "FAIL: rollback apagou ou nao despublicou o patrimonio" >&2; exit 1; }
ledger_apos_rollback="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$ledger_apos_rollback" == "0" ]] || { echo "FAIL: ledger apos rollback = $ledger_apos_rollback" >&2; exit 1; }

# 6) Rollback duplicado: recusa.
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: segundo rollback nao foi recusado" >&2; exit 1
fi

echo "PASS: admissao de Godeiro Linharess tem no-op de coorte vazia, abort sem escrita parcial em preimagem divergente, forward com pos-condicao completa (candidato, patrimonio, vinculo em chapas_2026, gate de completude), segunda execucao recusada, rollback preservador restaurando o vinculo e despublicando sem apagar, e rollback duplicado recusado, provados em PostgreSQL 17 contra as CHECK constraints reais de chapas_2026/candidatos"
