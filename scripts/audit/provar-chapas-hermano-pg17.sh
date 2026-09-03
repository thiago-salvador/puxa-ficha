#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel da 20260903130000 (nome de urna do vice de
# RN). Fixture minima: a linha real de chapas_2026 mais duas linhas de controle
# que a correcao NAO pode encostar, e coleta_log com os CHECKs reais de producao
# (medidos em 03/09/2026), os mesmos que a fixture de
# provar-vocabulario-situacao-pg17.sh carrega.
#
# Prova, em ordem: readback recusa o pre-estado; forward corrige uma coluna de
# uma linha; nome civil, ancora SQ, snapshot_em e as duas linhas de controle
# ficam intactos; segunda aplicacao aborta; readback recusa adulteracao de linha
# vizinha e de coluna vizinha; rollback recusa migration posterior; rollback
# devolve a tabela byte a byte ao pre-estado; e, por fim, a migration aplica como
# no-op limpo quando a linha alvo nao existe, que e o caso do replay linear.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260903130000"
# Predecessor no ledger. O digest e um literal de FIXTURE de proposito: este
# arquivo prova o SQL, e quem confere o hash real do predecessor contra o ledger
# de producao e o apply, que o calcula do arquivo no momento da aplicacao.
PREVIOUS="20260903120000"
PREVIOUS_DIGEST="sha256:fixture-previous"
MIGRATION="supabase/migrations/${VERSION}_chapas_2026_hermano_nome_urna.sql"
READBACK="supabase/readback/${VERSION}_chapas_2026_hermano_nome_urna.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_chapas_2026_hermano_nome_urna.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_chapas_2026_hermano_nome_urna.rollback.readback.sql"

for arquivo in "$MIGRATION" "$READBACK" "$ROLLBACK" "$ROLLBACK_READBACK"; do
  [[ -f "$arquivo" ]] || { echo "FAIL: artefato ausente: $arquivo" >&2; exit 2; }
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

# Fixture. `chapas_2026` sai do schema real (20260813040000) com os CHECKs ja
# relaxados pela quarentena (20260828025028); a unica diferenca e a FK para
# `candidatos`, que nao existe aqui e cujas colunas ficam NULL. `coleta_log`
# traz os CHECKs de producao copiados por pg_get_constraintdef em 03/09/2026,
# incluindo a UNIQUE (fonte, execucao, lote_cursor, candidato_id): sem eles a
# fixture aceitaria recibo que producao recusa, que foi exatamente como a
# primeira aplicacao do par de situacao_candidatura abortou em produca~o.
q -q <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);

CREATE TABLE public.chapas_2026 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  eleicao_codigo text NOT NULL,
  eleicao_data date NOT NULL,
  uf text,
  cargo_titular text NOT NULL CHECK (cargo_titular IN ('Presidente', 'Governador')),
  sq_coligacao text,
  identidade_status text NOT NULL CHECK (identidade_status IN ('confirmada', 'duplicidade_oficial')),
  vinculo_titular_status text NOT NULL CHECK (vinculo_titular_status IN ('confirmado', 'revisao_identidade', 'duplicidade_oficial', 'novo_perfil_oficial')),
  tse_situacao_codigo text NOT NULL,
  tse_situacao_titular_codigo text NOT NULL,
  tse_situacao_vice_codigo text NOT NULL,
  tipo_agremiacao text NOT NULL,
  composicao text NOT NULL,
  titular_candidato_id uuid,
  vice_candidato_id uuid,
  titular_sq_candidato text,
  vice_sq_candidato text,
  titular_nome_completo text NOT NULL,
  titular_nome_urna text NOT NULL,
  titular_partido_sigla text NOT NULL,
  vice_nome_completo text NOT NULL,
  vice_nome_urna text NOT NULL,
  vice_partido_sigla text NOT NULL,
  alternativas_oficiais jsonb NOT NULL DEFAULT '[]'::jsonb,
  fonte_url text NOT NULL,
  fonte_sha256 text NOT NULL,
  snapshot_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chapas_2026_check CHECK ((cargo_titular = 'Presidente' AND uf IS NULL) OR (cargo_titular = 'Governador' AND uf ~ '^[A-Z]{2}$')),
  CONSTRAINT chapas_2026_check1 CHECK ((identidade_status = 'confirmada' AND sq_coligacao IS NOT NULL) OR identidade_status = 'duplicidade_oficial'),
  CONSTRAINT chapas_2026_check2 CHECK (
    identidade_status <> 'duplicidade_oficial'
    OR (jsonb_array_length(alternativas_oficiais) = 2
        AND ((sq_coligacao IS NULL AND titular_sq_candidato IS NULL AND vice_sq_candidato IS NULL)
             OR (sq_coligacao IS NOT NULL AND titular_sq_candidato IS NOT NULL AND vice_sq_candidato IS NOT NULL)))
  ),
  CONSTRAINT chapas_2026_check3 CHECK (vinculo_titular_status IN ('confirmado', 'novo_perfil_oficial') OR (titular_candidato_id IS NULL AND titular_sq_candidato IS NULL))
);

CREATE TABLE public.coleta_log (
  id bigserial PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid,
  executado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL,
  volume integer NOT NULL DEFAULT 0,
  detalhe text,
  url text,
  execucao text,
  duracao_ms integer,
  lote_cursor integer,
  natureza text NOT NULL DEFAULT 'coleta',
  CONSTRAINT coleta_log_escopo_check CHECK (escopo = ANY (ARRAY['candidato'::text, 'territorio'::text, 'global'::text])),
  CONSTRAINT coleta_log_resultado_check CHECK (resultado = ANY (ARRAY['encontrado'::text, 'vazio_confirmado'::text, 'sem_achado_no_escopo'::text, 'nao_aplicavel'::text, 'erro'::text, 'indeterminado'::text])),
  CONSTRAINT coleta_log_natureza_check CHECK (natureza = ANY (ARRAY['coleta'::text, 'escrita'::text])),
  CONSTRAINT coleta_log_volume_check CHECK (volume >= 0),
  CONSTRAINT coleta_log_duracao_ms_check CHECK (duracao_ms IS NULL OR duracao_ms >= 0),
  CONSTRAINT coleta_log_lote_cursor_check CHECK (lote_cursor IS NULL OR lote_cursor >= 0),
  CONSTRAINT coleta_log_candidato_id_so_em_escopo_candidato CHECK ((escopo = 'candidato'::text) OR (candidato_id IS NULL)),
  CONSTRAINT coleta_log_execucao_lote_candidato_unique UNIQUE (fonte, execucao, lote_cursor, candidato_id),
  CONSTRAINT coleta_log_volume_coerente CHECK (
    CASE resultado
      WHEN 'encontrado'::text THEN (volume > 0)
      WHEN 'vazio_confirmado'::text THEN (volume = 0)
      WHEN 'sem_achado_no_escopo'::text THEN (volume = 0)
      WHEN 'nao_aplicavel'::text THEN (volume = 0)
      WHEN 'indeterminado'::text THEN (volume = 0)
      ELSE true
    END)
);

-- A linha alvo, com os valores medidos em producao em 03/09/2026, e duas
-- linhas de controle: uma vizinha de UF diferente e uma chapa presidencial.
-- Nenhuma das duas pode mudar, e o digest agregado do readback e quem cobra.
INSERT INTO public.chapas_2026
  (chave, eleicao_codigo, eleicao_data, uf, cargo_titular, sq_coligacao,
   identidade_status, vinculo_titular_status, tse_situacao_codigo,
   tse_situacao_titular_codigo, tse_situacao_vice_codigo, tipo_agremiacao,
   composicao, titular_sq_candidato, vice_sq_candidato,
   titular_nome_completo, titular_nome_urna, titular_partido_sigla,
   vice_nome_completo, vice_nome_urna, vice_partido_sigla,
   fonte_url, fonte_sha256, snapshot_em)
VALUES
  ('2026:RN:allyson-leandro-bezerra-silva', '6259', '2026-10-04', 'RN', 'Governador', '200001800267',
   'confirmada', 'confirmado', '#NE', '-3', '-3', 'COLIGAÇÃO',
   'REPUBLICANOS / MDB / PSD / AVANTE', '200002535255', '200002535256',
   'ALLYSON LEANDRO BEZERRA SILVA', 'ALLYSON', 'UNIÃO',
   'HERMANO DA COSTA MORAES', 'HERMANO MORAIS', 'MDB',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
   'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27', '2026-08-28T01:58:24.127Z'),
  ('2026:PB:controle-vizinho', '6259', '2026-10-04', 'PB', 'Governador', '200001800999',
   'confirmada', 'confirmado', '#NE', '-3', '-3', 'PARTIDO ISOLADO',
   'MDB', '200002599991', '200002599992',
   'CONTROLE VIZINHO DA SILVA', 'CONTROLE', 'MDB',
   'HERMANO DE CONTROLE', 'HERMANO MORAIS DE CONTROLE', 'MDB',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
   'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27', '2026-08-28T01:58:24.127Z'),
  ('2026:BR:controle-presidencial', '2026', '2026-10-04', NULL, 'Presidente', '200001800111',
   'confirmada', 'confirmado', '#NE', '-3', '-3', 'COLIGAÇÃO',
   'PARTIDO A / PARTIDO B', '200002511111', '200002511112',
   'CONTROLE PRESIDENCIAL', 'CONTROLE PRES', 'PARTIDO A',
   'VICE PRESIDENCIAL DE CONTROLE', 'VICE CONTROLE', 'PARTIDO B',
   'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
   'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27', '2026-08-28T01:58:24.127Z');
SQL

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$PREVIOUS', '$PREVIOUS_DIGEST')"

total="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026")"
[[ "$total" == "3" ]] || { echo "FAIL: fixture com $total linhas, esperado 3" >&2; exit 1; }

# `2026:PB:controle-vizinho` carrega 'HERMANO MORAIS DE CONTROLE' de proposito:
# um WHERE por LIKE ou por prefixo alcancaria essa linha, e o digest denunciaria.
vizinho_antes="$(q -Atq -c "SELECT vice_nome_urna FROM public.chapas_2026 WHERE chave='2026:PB:controle-vizinho'")"
[[ "$vizinho_antes" == "HERMANO MORAIS DE CONTROLE" ]] || { echo "FAIL: fixture do vizinho errada" >&2; exit 1; }

before="$(q -Atq -c "SELECT md5(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave)) FROM public.chapas_2026 ch")"

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou o pre-estado" >&2
  exit 1
fi

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

alvo="$(q -Atq -F '|' -c "SELECT vice_nome_urna || '|' || vice_nome_completo || '|' || vice_sq_candidato || '|' || vice_partido_sigla FROM public.chapas_2026 WHERE chave='2026:RN:allyson-leandro-bezerra-silva'")"
[[ "$alvo" == "HERMANO|HERMANO DA COSTA MORAES|200002535256|MDB" ]] || { echo "FAIL: linha alvo apos forward = $alvo" >&2; exit 1; }

intactas="$(q -Atq -c "SELECT count(*) FROM public.chapas_2026 WHERE chave <> '2026:RN:allyson-leandro-bezerra-silva' AND vice_nome_urna IN ('HERMANO MORAIS DE CONTROLE', 'VICE CONTROLE')")"
[[ "$intactas" == "2" ]] || { echo "FAIL: linhas de controle mudaram ($intactas de 2 intactas)" >&2; exit 1; }

proveniencia="$(q -Atq -F '|' -c "SELECT fonte_sha256 || '|' || snapshot_em::text FROM public.chapas_2026 WHERE chave='2026:RN:allyson-leandro-bezerra-silva'")"
[[ "$proveniencia" == "eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27|2026-08-28 01:58:24.127+00" ]] || {
  echo "FAIL: proveniencia da linha alvo foi carimbada: $proveniencia" >&2
  exit 1
}

recibo="$(q -Atq -F '|' -c "SELECT escopo || '|' || resultado || '|' || volume || '|' || natureza || '|' || (detalhe::jsonb ->> 'outras_count') FROM public.coleta_log WHERE execucao='migration:$VERSION'")"
[[ "$recibo" == "territorio|encontrado|1|escrita|2" ]] || { echo "FAIL: recibo de pre-imagem = $recibo" >&2; exit 1; }
preimagem="$(q -Atq -c "SELECT detalhe::jsonb -> 'linhas' -> 0 ->> 'vice_nome_urna' FROM public.coleta_log WHERE execucao='migration:$VERSION'")"
[[ "$preimagem" == "HERMANO MORAIS" ]] || { echo "FAIL: pre-imagem gravada = $preimagem" >&2; exit 1; }

# Segunda aplicacao aborta: a pre-condicao exige a pre-imagem exata, e ela nao
# existe mais. Sem isso, um re-dispatch escreveria recibo duplicado.
if q -q < "$MIGRATION" >/dev/null 2>&1; then
  echo "FAIL: segunda aplicacao da migration foi aceita" >&2
  exit 1
fi

# Adulteracao 1: linha VIZINHA mexida. Nenhuma asseveracao sobre o alvo muda,
# e mesmo assim o readback tem que reprovar, porque o digest agregado do recibo
# e a unica coisa que enxerga esse estrago.
q -q -c "UPDATE public.chapas_2026 SET vice_nome_urna='ADULTERADO' WHERE chave='2026:PB:controle-vizinho'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou adulteracao de linha vizinha" >&2
  exit 1
fi
q -q -c "UPDATE public.chapas_2026 SET vice_nome_urna='HERMANO MORAIS DE CONTROLE' WHERE chave='2026:PB:controle-vizinho'"
q -q < "$READBACK"

# Adulteracao 2: coluna vizinha DA PROPRIA linha alvo. O nome civil e o que a
# migration promete nao tocar, entao o readback tem que reprovar quem tocar.
q -q -c "UPDATE public.chapas_2026 SET vice_nome_completo='HERMANO ADULTERADO' WHERE chave='2026:RN:allyson-leandro-bezerra-silva'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou adulteracao de vice_nome_completo" >&2
  exit 1
fi
q -q -c "UPDATE public.chapas_2026 SET vice_nome_completo='HERMANO DA COSTA MORAES' WHERE chave='2026:RN:allyson-leandro-bezerra-silva'"
q -q < "$READBACK"

# Rollback recusa reverter no meio da pilha.
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260904000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2
  exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260904000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

after="$(q -Atq -c "SELECT md5(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave)) FROM public.chapas_2026 ch")"
[[ "$after" == "$before" ]] || { echo "FAIL: rollback nao devolveu a tabela byte a byte" >&2; exit 1; }
ledger="$(q -Atq -c "SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations")"
[[ "$ledger" == "$PREVIOUS" ]] || { echo "FAIL: ledger apos rollback = $ledger" >&2; exit 1; }

# Segundo rollback aborta: nao ha mais versao no topo para reverter.
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: segundo rollback foi aceito" >&2
  exit 1
fi

# Replay linear: com a tabela sem a linha alvo, a migration e no-op limpo. E o
# que autoriza contar esta migration como "aplicada" no manifesto de replay em
# vez de acrescentar mais uma falha conhecida.
q -q -c "DELETE FROM public.chapas_2026"
q -q -c "DELETE FROM public.coleta_log"
q -q < "$MIGRATION"
noop="$(q -Atq -F '|' -c "SELECT resultado || '|' || volume FROM public.coleta_log WHERE execucao='migration:$VERSION'")"
[[ "$noop" == "vazio_confirmado|0" ]] || { echo "FAIL: no-op de replay gravou recibo $noop" >&2; exit 1; }

echo "PASS: 20260903130000 provada em PostgreSQL 17 com 21 checagens (forward, proveniencia intacta, recibo com pre-imagem, reaplicacao recusada, duas adulteracoes, migration posterior, rollback byte a byte, segundo rollback recusado, ledger e no-op de replay)"
