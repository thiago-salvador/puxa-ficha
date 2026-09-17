#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260917000001 (refresca a chapa
# presidencial do PRTB para 'Pendente de julgamento' e sincroniza
# tse_situacao_codigo), contra o schema REAL de chapas_2026 (todas as CHECK
# constraints de producao). Sucede 20260917000000 (alarga o dominio); esta
# prova roda com o dominio JA alargado, e ADICIONALMENTE reproduz o
# incidente de apply 35179453431: a mesma UPDATE, contra o dominio
# ESTREITO (estado real antes de 20260917000000 aplicar), e recusada pela
# constraint real -- exatamente o que a PR #357 nao provou.
#
# Prova: (0) a UPDATE desta migration, contra o dominio estreito, reproduz
# o incidente; (1) no-op em banco vazio; (2) abort sem escrita parcial
# quando a preimagem diverge; (3) forward com pos-condicao completa (chapa
# refrescada, tse_situacao_codigo sincronizado); (4) segunda execucao
# recusada; (5) rollback restaurando o texto antigo; (6) rollback duplicado
# recusado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260917000001"
MIGRATION="supabase/migrations/${VERSION}_refrescar_fonte_detalhe_prtb.sql"
READBACK="supabase/readback/${VERSION}_refrescar_fonte_detalhe_prtb.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_refrescar_fonte_detalhe_prtb.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_refrescar_fonte_detalhe_prtb.rollback.readback.sql"
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

seed() {
q -q <<'SQL'
INSERT INTO public.candidatos (id, slug, sq_candidato_2026, nome_completo, nome_urna, partido_atual, partido_sigla, cargo_disputado) VALUES
  ('9c1c0b1e-6e2b-4f0a-9f1a-000000000001', 'leonardo-avalanche', '280002554479', 'LEONARDO AVALANCHE', 'LEONARDO AVALANCHE', 'PRTB', 'PRTB', 'Presidente');
INSERT INTO public.chapas_2026 (
  chave, eleicao_codigo, eleicao_data, uf, cargo_titular, sq_coligacao,
  identidade_status, vinculo_titular_status, tse_situacao_codigo,
  tipo_agremiacao, composicao, titular_candidato_id, titular_sq_candidato,
  vice_sq_candidato, titular_nome_completo, titular_nome_urna, titular_partido_sigla,
  vice_nome_completo, vice_nome_urna, vice_partido_sigla,
  fonte_url, fonte_sha256, snapshot_em, fonte_tipo, fonte_detalhe
) VALUES (
  '2026:BR:pablo-henrique-costa-marcal', '6259', '2026-10-04', NULL, 'Presidente', NULL,
  'confirmada', 'novo_perfil_oficial', 'Aguardando julgamento',
  'PARTIDO ISOLADO', 'PRTB', '9c1c0b1e-6e2b-4f0a-9f1a-000000000001', '280002554479',
  '280002554490', 'LEONARDO AVALANCHE', 'LEONARDO AVALANCHE', 'PRTB',
  'SILVIA', 'SILVIA', 'PRTB',
  'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479',
  '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad',
  '2026-09-15T15:04:36.472Z', 'divulgacand_detalhe',
  '{"titular":{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479","sha256":"6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad","checked_at":"2026-09-15T15:04:36.472Z","http_status":"200","sq_candidato":"280002554479","nome_completo":"LEONARDO AVALANCHE","nome_urna":"LEONARDO AVALANCHE","partido_sigla":"PRTB","cargo":"Presidente","uf":"BR","descricao_situacao":"Aguardando julgamento","vice_vigente_sq":"280002554490","contagem_vices_vigentes":1,"is_candidato_inapto":false,"substituido":false},"vice":{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554490","sha256":"e2a45d22429fb28baa6d075592de32ceba85f9eccec4c309bf564c6ee8360e02","checked_at":"2026-09-15T15:04:36.528Z","http_status":"200","sq_candidato":"280002554490","nome_completo":"SILVIA","nome_urna":"SILVIA","partido_sigla":"PRTB","cargo":"Vice-presidente","uf":"BR","descricao_situacao":"Aguardando julgamento","is_candidato_inapto":false,"substituido":false}}'::jsonb
);
SQL
}

M="$MIGRATION"

q -q < "$REAL_SCHEMA"

# 0a) coleta_log_escopo_check real: o INSERT da migration original (antes
# deste fix) usava escopo='chapa', valor fora do dominio real
# (candidato/territorio/global). Reproduz o segundo defeito do dry-run de
# producao (BEGIN...ROLLBACK do coordenador em 17/09/2026) antes de provar
# que a migration corrigida (escopo='global', mesmo padrao de
# 20260916140000) aplica.
if q -q -c "INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza) VALUES ('tse','chapa','chapas_2026.fonte_detalhe:prtb','encontrado',1,'x','http://x','test:escopo-chapa-invalido','escrita')" >/dev/null 2>&1; then
  echo "FAIL: INSERT em coleta_log com escopo='chapa' deveria ser recusado por coleta_log_escopo_check" >&2; exit 1
fi
echo "PASS (0a): coleta_log_escopo_check real recusa escopo='chapa' (defeito do dry-run de producao reproduzido)"

# 0) Contra o dominio ESTREITO (sem 20260917000000 ter aplicado): reproduz
# o incidente real.
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
seed
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou contra o dominio estreito (deveria reproduzir o incidente)" >&2; exit 1
fi
echo "PASS (0): UPDATE reproduz o incidente real contra o dominio estreito (chapas_2026_fonte_detalhe_check recusa)"
q -q -c "DELETE FROM public.chapas_2026; DELETE FROM public.candidatos;"

# A partir daqui, dominio JA alargado (estado real depois de 20260917000000):
# troca so a constraint pela versao larga do REAL_SCHEMA, sem recriar tabelas.
q -q -c "TRUNCATE public.chapas_2026, public.candidatos, public.patrimonio, public.coleta_log, supabase_migrations.schema_migrations"
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
      AND (fonte_detalhe->'titular'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso', 'Pendente de julgamento'])
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
      AND (fonte_detalhe->'vice'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso', 'Pendente de julgamento'])
      AND (fonte_detalhe->'vice'->'is_candidato_inapto') = 'false'::jsonb
      AND (fonte_detalhe->'vice'->'substituido') = 'false'::jsonb
    ) IS TRUE)
  );
SQL

# 1) Banco vazio: no-op, nao falha.
q -q < "$M"
vazio="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$vazio" == "0" ]] || { echo "FAIL: migration escreveu no ledger em coorte vazia" >&2; exit 1; }

seed

# 2) Preimagem errada: aborta sem escrita parcial.
q -q -c "UPDATE public.chapas_2026 SET tse_situacao_codigo='Deferido', fonte_detalhe=jsonb_set(fonte_detalhe,'{titular,descricao_situacao}','\"Deferido\"') WHERE chave='2026:BR:pablo-henrique-costa-marcal'"
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou com preimagem divergente" >&2; exit 1
fi
parcial="$(q -Atq -c "SELECT count(*) FROM public.coleta_log")"
[[ "$parcial" == "0" ]] || { echo "FAIL: escrita parcial sobrou apos abort de preimagem" >&2; exit 1; }
q -q -c "UPDATE public.chapas_2026 SET tse_situacao_codigo='Aguardando julgamento', fonte_detalhe=jsonb_set(fonte_detalhe,'{titular,descricao_situacao}','\"Aguardando julgamento\"') WHERE chave='2026:BR:pablo-henrique-costa-marcal'"

# 3) Forward limpo.
q -q < "$M"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
q -q < "$READBACK"

titular_ok="$(q -Atq -c "SELECT fonte_detalhe->'titular'->>'descricao_situacao' FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$titular_ok" == "Pendente de julgamento" ]] || { echo "FAIL: titular nao refrescado ($titular_ok)" >&2; exit 1; }
vice_ok="$(q -Atq -c "SELECT fonte_detalhe->'vice'->>'descricao_situacao' FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$vice_ok" == "Pendente de julgamento" ]] || { echo "FAIL: vice nao refrescado ($vice_ok)" >&2; exit 1; }
tse_ok="$(q -Atq -c "SELECT tse_situacao_codigo FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$tse_ok" == "Pendente de julgamento" ]] || { echo "FAIL: tse_situacao_codigo nao sincronizado ($tse_ok)" >&2; exit 1; }

# 4) Segunda execucao: preimagem ja mudou, recusa.
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou de novo sobre estado ja migrado" >&2; exit 1
fi

# 5) Rollback restaura o texto antigo.
q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"
apos_rollback="$(q -Atq -c "SELECT fonte_detalhe->'titular'->>'descricao_situacao' FROM public.chapas_2026 WHERE chave='2026:BR:pablo-henrique-costa-marcal'")"
[[ "$apos_rollback" == "Aguardando julgamento" ]] || { echo "FAIL: rollback nao restaurou o texto antigo ($apos_rollback)" >&2; exit 1; }
ledger_apos_rollback="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$ledger_apos_rollback" == "0" ]] || { echo "FAIL: ledger apos rollback = $ledger_apos_rollback" >&2; exit 1; }

# 6) Rollback duplicado: recusa.
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: segundo rollback nao foi recusado" >&2; exit 1
fi

echo "PASS: refresco de fonte_detalhe da chapa PRTB tem (0) reproducao do incidente real contra o dominio estreito, (1) no-op de coorte vazia, (2) abort sem escrita parcial em preimagem divergente, (3) forward com pos-condicao completa (chapa, tse_situacao_codigo), (4) segunda execucao recusada, (5) rollback restaurando o texto antigo, (6) rollback duplicado recusado, provados em PostgreSQL 17 contra as CHECK constraints reais de chapas_2026"
