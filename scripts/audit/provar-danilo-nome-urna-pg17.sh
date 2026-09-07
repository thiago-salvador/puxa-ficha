#!/usr/bin/env bash
# Fixture mínima PG17 com controles de outras linhas e colunas não alteráveis.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
CID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres "$IMAGE")"
trap 'docker stop "$CID" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  if docker exec -e PGPASSWORD=postgres "$CID" psql -h 127.0.0.1 -U postgres -Atqc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
q() { docker exec -i "$CID" psql -X -U postgres -v ON_ERROR_STOP=1 "$@"; }
fail_sql() {
  local output status
  if output="$(q -q < "$1" 2>&1)"; then
    echo "FAIL: deveria recusar $1 com: $2" >&2
    exit 1
  else
    status=$?
  fi
  # psql ON_ERROR_STOP retorna 3 para erro SQL; conexão/runtime não comprovam guard.
  if [[ "$status" -ne 3 || "$output" != *"ERROR:  $2"* ]]; then
    printf 'FAIL: erro inesperado em %s (exit %s), esperado: %s\n%s\n' "$1" "$status" "$2" "$output" >&2
    exit 1
  fi
}
M="supabase/migrations/20260907180000_danilo_nome_urna.sql"
R="supabase/readback/20260907180000_danilo_nome_urna.readback.sql"
B="supabase/rollback/20260907180000_danilo_nome_urna.rollback.sql"
BR="supabase/readback/20260907180000_danilo_nome_urna.rollback.readback.sql"
q -q <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY, slug text UNIQUE, sq_candidato_2026 text,
  nome_urna text, nome_completo text, cargo_disputado text, estado text,
  partido_sigla text, fonte_dados text[], biografia text,
  ultima_atualizacao timestamptz DEFAULT '2026-09-06T00:00:00Z'
);
CREATE TABLE public.chapas_2026 (
  chave text PRIMARY KEY, titular_candidato_id uuid REFERENCES public.candidatos(id),
  titular_sq_candidato text, titular_nome_urna text, titular_nome_completo text,
  titular_partido_sigla text, uf text, cargo_titular text, fonte_url text,
  fonte_sha256 text, snapshot_em timestamptz, controle text DEFAULT 'preservar'
);
CREATE TABLE public.coleta_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fonte text NOT NULL,
  escopo text CHECK (escopo IN ('candidato', 'territorio', 'global')),
  alvo text, candidato_id uuid REFERENCES public.candidatos(id),
  resultado text CHECK (resultado IN ('encontrado', 'vazio_confirmado', 'sem_achado_no_escopo', 'nao_aplicavel', 'erro', 'indeterminado')),
  volume integer NOT NULL CHECK (volume >= 0), detalhe text, url text,
  execucao text, natureza text CHECK (natureza IN ('coleta', 'escrita')),
  CHECK (escopo = 'candidato' OR candidato_id IS NULL),
  CHECK ((resultado = 'encontrado' AND volume > 0) OR (resultado <> 'encontrado' AND volume = 0))
);
INSERT INTO public.candidatos VALUES (
  'ce3b18ad-dcc9-4275-b831-66ee24422714', 'danilo-pinheiro', '90002553733',
  'Danilo Pinheiro', 'Danilo Pinheiro Evangelista da Silva', 'Governador', 'GO', 'PCO',
  ARRAY['TSE consulta_cand 2026; snapshot 17/08/2026', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/GO/20322002026/candidato/90002553733'],
  'Danilo Pinheiro Evangelista da Silva, que usa o nome de urna Danilo Pinheiro, nasceu em fixture. Resto preservado.', DEFAULT
);
INSERT INTO public.candidatos (id, slug, nome_urna, biografia) VALUES ('00000000-0000-0000-0000-000000000001', 'controle', 'Danilo Pinheiro', 'Controle');
INSERT INTO public.chapas_2026 VALUES (
  '2026:GO:danilo-pinheiro-evangelista-da-silva', 'ce3b18ad-dcc9-4275-b831-66ee24422714',
  '90002553733', 'DANILO PINHEIRO', 'DANILO PINHEIRO EVANGELISTA DA SILVA', 'PCO', 'GO', 'Governador',
  'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
  'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27', '2026-08-28T01:58:24.127+00:00', DEFAULT
);
INSERT INTO public.chapas_2026 (chave, titular_nome_urna) VALUES ('controle', 'DANILO PINHEIRO');
SQL
fail_sql "$R" 'danilo readback: recibo ausente/duplicado/inválido'
# Identidade e origem incorretas devem abortar sem recibo ou alteração parcial.
q -q -c "UPDATE public.chapas_2026 SET titular_sq_candidato = 'errado' WHERE chave <> 'controle'"
fail_sql "$M" 'danilo: preimagem/identidade/origem divergiu ou migration já aplicada'
q -q -c "UPDATE public.chapas_2026 SET titular_sq_candidato = '90002553733', fonte_sha256 = 'errada' WHERE chave <> 'controle'"
fail_sql "$M" 'danilo: preimagem/identidade/origem divergiu ou migration já aplicada'
q -q <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.coleta_log) OR EXISTS (SELECT 1 FROM public.candidatos WHERE nome_urna = 'Danilo da Silva') THEN RAISE EXCEPTION 'não atômico'; END IF;
END $$;
UPDATE public.chapas_2026 SET fonte_sha256 = 'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27' WHERE chave <> 'controle';
SQL
q -q < "$M"
q -q -c "INSERT INTO supabase_migrations.schema_migrations VALUES ('20260907180000')"
q -q < "$R"
fail_sql "$M" 'danilo: preimagem/identidade/origem divergiu ou migration já aplicada'
q -q < "$R"
# Drift deve bloquear readback e rollback; depois a reversão restaura a preimagem.
q -q -c "UPDATE public.candidatos SET nome_completo = 'drift' WHERE slug = 'danilo-pinheiro'"
fail_sql "$R" 'danilo readback: estado final/invariância divergiu'
fail_sql "$B" 'danilo rollback: drift em candidato/chapa ou outras linhas'
q -q -c "UPDATE public.candidatos SET nome_completo = 'Danilo Pinheiro Evangelista da Silva' WHERE slug = 'danilo-pinheiro'"
q -q -c "UPDATE public.chapas_2026 SET controle = 'drift' WHERE chave = 'controle'"
fail_sql "$R" 'danilo readback: estado final/invariância divergiu'
fail_sql "$B" 'danilo rollback: drift em candidato/chapa ou outras linhas'
q -q -c "UPDATE public.chapas_2026 SET controle = 'preservar' WHERE chave = 'controle'"
q -q -c "INSERT INTO supabase_migrations.schema_migrations VALUES ('20260907190000')"
fail_sql "$B" 'danilo rollback: ledger divergiu'
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260907190000'"
q -q < "$B"
q -q < "$BR"
fail_sql "$B" 'danilo rollback: ledger divergiu'
# Alvo faltante em banco populado recusa; só replay explícito/vazio faz no-op.
q -q -c "DELETE FROM public.chapas_2026 WHERE chave <> 'controle'"
fail_sql "$M" 'danilo: preimagem/identidade/origem divergiu ou migration já aplicada'
{ echo "SET pf.replay = 'true';"; cat "$M"; } | q -q
q -q -c "TRUNCATE public.candidatos CASCADE"
q -q < "$M"
echo 'PASS PG17: forward, invariância, reapply seguro, guards identidade/origem, drift, ledger, rollback, replay e alvo ausente.'
