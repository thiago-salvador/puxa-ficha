#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260916140000 (issue #340: seis
# situacoes de candidatos, carlos-jararaca despublicado, tres chapas de
# RN/SE substituidas).
#
# Prova: no-op em banco vazio, no-op com pf.replay=true, forward com
# pos-condicao completa (situacoes, despublicacao, chapas, SQ antigo ausente,
# recibo de coleta_log com a pre-imagem das chapas), abort sem escrita
# parcial quando uma preimagem diverge (linha de controle intacta), segunda
# execucao recusada (a preimagem ja mudou), rollback restaurando os nove
# alvos a partir da quarentena e do recibo, e recusa de rollback duplicado.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260916140000"
PREVIOUS="20260916130000"
MIGRATION="supabase/migrations/${VERSION}_reconciliar_situacoes_e_chapas_16092026.sql"
READBACK="supabase/readback/${VERSION}_reconciliar_situacoes_e_chapas_16092026.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_reconciliar_situacoes_e_chapas_16092026.rollback.sql"
for f in "$MIGRATION" "$READBACK" "$ROLLBACK"; do
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
q_replay() {
  docker exec -e PGOPTIONS='-c pf.replay=true' -i "$CONTAINER_ID" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q --single-transaction -f -
}

schema() {
q -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY, idempotency_key text
);
CREATE TABLE IF NOT EXISTS public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  sq_candidato_2026 text,
  status text NOT NULL DEFAULT 'candidato',
  publicavel boolean NOT NULL DEFAULT true,
  situacao_candidatura text,
  ultima_atualizacao timestamptz NOT NULL DEFAULT '2026-01-01T00:00:00Z',
  CONSTRAINT candidatos_situacao_candidatura_dominio
    CHECK (situacao_candidatura IS NULL OR situacao_candidatura IN (
      'aguardando julgamento', 'candidatura declarada', 'incerto',
      'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso',
      'pendente de julgamento'
    ))
);
CREATE TABLE IF NOT EXISTS public.chapas_2026 (
  chave text PRIMARY KEY,
  titular_sq_candidato text, titular_nome_completo text, titular_nome_urna text,
  titular_partido_sigla text, titular_candidato_id uuid REFERENCES public.candidatos(id),
  vice_sq_candidato text, vice_nome_completo text, vice_nome_urna text,
  vice_partido_sigla text, vice_candidato_id uuid REFERENCES public.candidatos(id),
  fonte_sha256 text, snapshot_em timestamptz
);
CREATE TABLE IF NOT EXISTS public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL, escopo text, alvo text, candidato_id uuid,
  resultado text, volume integer, detalhe text, url text, execucao text, natureza text
);
CREATE TABLE IF NOT EXISTS public.identidade_timeline_quarentena_snapshot (
  migration_version text NOT NULL, tabela text NOT NULL, row_id uuid NOT NULL,
  candidato_id uuid NOT NULL, preimage jsonb NOT NULL, postimage jsonb NOT NULL,
  registrado_em timestamptz NOT NULL,
  PRIMARY KEY (migration_version, tabela, row_id)
);
SQL
}

seed() {
q -q <<'SQL'
-- carlos-jararaca precisa do MESMO id que chapas_2026.titular_candidato_id
-- carrega no lado de producao, porque a migration ancora a preimagem de
-- chapas nesse UUID literal.
INSERT INTO public.candidatos (id, slug, sq_candidato_2026, status, publicavel, situacao_candidatura) VALUES
  ('51e9be3d-bd06-45e5-828d-48160265925f', 'carlos-jararaca', '200002550223', 'candidato', false, 'indeferido');
INSERT INTO public.candidatos (slug, sq_candidato_2026, status, publicavel, situacao_candidatura) VALUES
  ('ariel-capistrano',   '50002535253',  'candidato', true, 'deferido com recurso'),
  ('roberto-rocha',      '100002551399', 'candidato', true, 'aguardando julgamento'),
  ('elizeu-aguiar',      '180002549920', 'candidato', true, 'deferido'),
  ('marcelo-brigadeiro', '240002544118', 'candidato', true, 'aguardando julgamento'),
  ('ruth-reis',          '140002554434', 'candidato', true, 'aguardando julgamento'),
  ('leonardo-avalanche', '280002554479', 'candidato', true, 'aguardando julgamento'),
  ('controle',           '999999',       'candidato', true, 'aguardando julgamento');

INSERT INTO public.chapas_2026 (chave, titular_sq_candidato, titular_nome_completo, titular_nome_urna, titular_partido_sigla, titular_candidato_id, vice_sq_candidato, vice_nome_completo, vice_nome_urna, vice_partido_sigla) VALUES
  ('2026:RN:carlos-alberto-de-almeida-cavalcante', '200002550223', 'CARLOS ALBERTO DE ALMEIDA CAVALCANTE', 'CARLOS JARARACA', 'DC',
   '51e9be3d-bd06-45e5-828d-48160265925f', '200002550224', 'JULIO CESAR NEVES', 'PASTOR JÚLIO', 'DC');
INSERT INTO public.chapas_2026 (chave, titular_sq_candidato, titular_nome_completo, titular_nome_urna, titular_partido_sigla, vice_sq_candidato, vice_nome_completo, vice_nome_urna, vice_partido_sigla) VALUES
  ('2026:RN:henrique-othon-costa-de-lyra', '200002553301', 'HENRIQUE OTHON COSTA DE LYRA', 'HENRIQUE LYRA', 'PCO',
   '200002553302', 'ANDRE GUSTAVO MEDEIROS DE OLIVEIRA', 'ANDRE GUSTAVO', 'PCO'),
  ('2026:SE:emanuel-messias-oliveira-cacho', '260002551712', 'EMANUEL MESSIAS OLIVEIRA CACHO', 'EMANUEL CACHO', 'PSDB',
   '260002551711', 'SUELY CHAVES BARRETO', 'SUELY BARRETO', 'CIDADANIA'),
  ('controle', '000', 'CONTROLE', 'CONTROLE', 'XX', '001', 'CONTROLE VICE', 'CONTROLE VICE', 'XX');
SQL
}

M="$MIGRATION"

# 1) Banco vazio (candidatos sem linha): no-op, nao falha.
schema
q -q < "$M"
vazio="$(q -Atq -c "SELECT count(*) FROM supabase_migrations.schema_migrations")"
[[ "$vazio" == "0" ]] || { echo "FAIL: migration escreveu no ledger em coorte vazia" >&2; exit 1; }

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$PREVIOUS')"
seed

# 2) pf.replay=true: no-op mesmo com a coorte presente.
antes_replay="$(q -Atq -c "SELECT md5(string_agg(slug||'='||coalesce(situacao_candidatura,'')||'|'||status, ',' ORDER BY slug)) FROM public.candidatos")"
cat "$M" | q_replay
depois_replay="$(q -Atq -c "SELECT md5(string_agg(slug||'='||coalesce(situacao_candidatura,'')||'|'||status, ',' ORDER BY slug)) FROM public.candidatos")"
[[ "$antes_replay" == "$depois_replay" ]] || { echo "FAIL: pf.replay=true nao impediu a escrita" >&2; exit 1; }

# 3) Preimagem errada (uma ficha diverge): aborta sem escrita parcial.
q -q -c "UPDATE public.candidatos SET situacao_candidatura='indeferido' WHERE slug='ariel-capistrano'"
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou com preimagem divergente" >&2; exit 1
fi
parcial="$(q -Atq -c "SELECT count(*) FROM public.coleta_log")"
[[ "$parcial" == "0" ]] || { echo "FAIL: escrita parcial sobrou apos abort de preimagem" >&2; exit 1; }
q -q -c "UPDATE public.candidatos SET situacao_candidatura='deferido com recurso' WHERE slug='ariel-capistrano'"

# 4) Forward limpo.
q -q < "$M"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('$VERSION')"
q -q < "$READBACK"

situ_ok="$(q -Atq -c "
  SELECT count(*) FROM (VALUES
    ('ariel-capistrano','deferido'), ('roberto-rocha','indeferido com recurso'),
    ('elizeu-aguiar','deferido com recurso'), ('marcelo-brigadeiro','deferido'),
    ('ruth-reis','pendente de julgamento'), ('leonardo-avalanche','pendente de julgamento')
  ) AS e(slug,situ) JOIN public.candidatos c ON c.slug=e.slug AND c.situacao_candidatura=e.situ")"
[[ "$situ_ok" == "6" ]] || { echo "FAIL: situacoes pos-forward = $situ_ok, esperado 6" >&2; exit 1; }

carlos_ok="$(q -Atq -c "SELECT count(*) FROM public.candidatos WHERE slug='carlos-jararaca' AND status='removido' AND publicavel IS FALSE AND situacao_candidatura='indeferido'")"
[[ "$carlos_ok" == "1" ]] || { echo "FAIL: carlos-jararaca nao despublicado" >&2; exit 1; }

chapas_ok="$(q -Atq -c "
  SELECT count(*) FROM public.chapas_2026 WHERE
    (chave='2026:RN:carlos-alberto-de-almeida-cavalcante' AND titular_sq_candidato='200002554482' AND titular_candidato_id IS NULL)
    OR (chave='2026:RN:henrique-othon-costa-de-lyra' AND vice_sq_candidato='200002554523')
    OR (chave='2026:SE:emanuel-messias-oliveira-cacho' AND vice_sq_candidato='260002554525')")"
[[ "$chapas_ok" == "3" ]] || { echo "FAIL: chapas pos-forward = $chapas_ok, esperado 3" >&2; exit 1; }

sobrou="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026 WHERE titular_sq_candidato='200002550223' OR vice_sq_candidato='200002553302' OR vice_sq_candidato='260002551711'")"
[[ "$sobrou" == "0" ]] || { echo "FAIL: SQ substituido sobrou em chapas_2026" >&2; exit 1; }

controle_intacto="$(q -Atq -c "SELECT count(*) FROM public.candidatos WHERE slug='controle' AND situacao_candidatura='aguardando julgamento'")"
[[ "$controle_intacto" == "1" ]] || { echo "FAIL: linha de controle de candidatos foi tocada" >&2; exit 1; }
controle_chapas_intacto="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026 WHERE chave='controle' AND vice_sq_candidato='001'")"
[[ "$controle_chapas_intacto" == "1" ]] || { echo "FAIL: linha de controle de chapas_2026 foi tocada" >&2; exit 1; }

linhas_recibo="$(q -Atq -c "SELECT jsonb_array_length(detalhe::jsonb -> 'linhas') FROM public.coleta_log WHERE execucao='migration:20260916140000'")"
[[ "$linhas_recibo" == "3" ]] || { echo "FAIL: recibo de coleta_log sem as 3 linhas de pre-imagem de chapas (%)" "$linhas_recibo" >&2; exit 1; }

# 5) Segunda execucao: a preimagem ja mudou, tem de recusar.
if q -q < "$M" >/dev/null 2>&1; then
  echo "FAIL: migration aplicou de novo sobre estado ja migrado" >&2; exit 1
fi

# 6) Rollback restaura os nove alvos.
q -q < "$ROLLBACK"
apos_rollback_situ="$(q -Atq -c "
  SELECT count(*) FROM (VALUES
    ('ariel-capistrano','deferido com recurso'), ('roberto-rocha','aguardando julgamento'),
    ('elizeu-aguiar','deferido'), ('marcelo-brigadeiro','aguardando julgamento'),
    ('ruth-reis','aguardando julgamento'), ('leonardo-avalanche','aguardando julgamento')
  ) AS e(slug,situ) JOIN public.candidatos c ON c.slug=e.slug AND c.situacao_candidatura=e.situ")"
[[ "$apos_rollback_situ" == "6" ]] || { echo "FAIL: rollback nao restaurou as 6 situacoes ($apos_rollback_situ)" >&2; exit 1; }
apos_rollback_carlos="$(q -Atq -c "SELECT count(*) FROM public.candidatos WHERE slug='carlos-jararaca' AND status='candidato'")"
[[ "$apos_rollback_carlos" == "1" ]] || { echo "FAIL: rollback nao restaurou carlos-jararaca" >&2; exit 1; }
apos_rollback_chapas="$(q -Atq -c "
  SELECT count(*) FROM public.chapas_2026 WHERE
    (chave='2026:RN:carlos-alberto-de-almeida-cavalcante' AND titular_sq_candidato='200002550223')
    OR (chave='2026:RN:henrique-othon-costa-de-lyra' AND vice_sq_candidato='200002553302')
    OR (chave='2026:SE:emanuel-messias-oliveira-cacho' AND vice_sq_candidato='260002551711')")"
[[ "$apos_rollback_chapas" == "3" ]] || { echo "FAIL: rollback nao restaurou as 3 chapas ($apos_rollback_chapas)" >&2; exit 1; }
ledger_apos_rollback="$(q -Atq -c "SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations")"
[[ "$ledger_apos_rollback" == "$PREVIOUS" ]] || { echo "FAIL: ledger apos rollback = $ledger_apos_rollback" >&2; exit 1; }

# 7) Rollback duplicado: recusa.
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: segundo rollback nao foi recusado" >&2; exit 1
fi

echo "PASS: reconciliacao de seis situacoes, despublicacao de carlos-jararaca e tres substituicoes de chapa tem no-op de coorte vazia, no-op de pf.replay, abort sem escrita parcial em preimagem divergente, forward com pos-condicao completa, segunda execucao recusada, rollback restaurando os nove alvos e rollback duplicado recusado, provados em PostgreSQL 17"
