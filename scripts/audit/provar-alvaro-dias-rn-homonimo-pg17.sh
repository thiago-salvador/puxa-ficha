#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel de 20260903220000 (despublicacao logica das
# 6 linhas de historico_politico e das 2 de financiamento que pertencem a ALVARO
# FERNANDES DIAS (PR) e estao na ficha de ALVARO COSTA DIAS (RN)).
#
# Prova, nesta ordem: readback recusando o pre-estado, forward, o efeito visivel
# ao leitor (financiamento_publico para de somar o dinheiro do homonimo), recibo
# de pre-imagem com as 8 linhas, o erro OPOSTO sendo pego (despublicar mandato
# verdadeiro do RN), motivo vazio reprovando, migration posterior bloqueando o
# rollback, rollback byte a byte e no-op de replay.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260903220000"
PREVIOUS="20260903210000"
MIGRATION="supabase/migrations/${VERSION}_despublicar_alvaro_dias_rn_homonimo.sql"
READBACK="supabase/readback/${VERSION}_despublicar_alvaro_dias_rn_homonimo.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_despublicar_alvaro_dias_rn_homonimo.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_despublicar_alvaro_dias_rn_homonimo.rollback.readback.sql"
for f in "$MIGRATION" "$READBACK" "$ROLLBACK" "$ROLLBACK_READBACK"; do
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

# Fixture com os UUID reais das 8 linhas do achado, mais as 12 linhas do Rio
# Grande do Norte que TEM de sobreviver, mais uma ficha vizinha para provar que
# a despublicacao nao vaza de candidato.
# Heredoc CITADO: com o delimitador entre aspas o shell nao expande nada aqui
# dentro, entao crase, $ e $( ficam sendo texto de SQL. A versao anterior era
# `q -q <<SQL` e uma crase num comentario virou substituicao de comando; o
# prover seguiu saindo 0 e o erro so aparecia no stderr. O unico valor que
# precisava vir de fora passa a entrar por variavel do psql.
q -q -v previous="$PREVIOUS" <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text,
  created_by text, idempotency_key text, rollback text[]
);
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES (:'previous', 'sha256:fixture-previous');

CREATE TABLE public.candidatos (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE);
CREATE TABLE public.historico_politico (
  id uuid PRIMARY KEY, candidato_id uuid NOT NULL, cargo text,
  despublicado_em timestamptz, despublicacao_motivo text
);
CREATE TABLE public.financiamento (
  -- Nomes copiados do information_schema de producao (04/09/2026). A primeira
  -- versao desta fixture inventou `ano` e `total_receitas`, e por isso o prover
  -- validou o readback contra um schema que nao existe: os dois lados eram
  -- escritos aqui, entao a prova adversarial nunca tocou no defeito.
  id uuid PRIMARY KEY, candidato_id uuid NOT NULL, ano_eleicao integer NOT NULL,
  total_arrecadado numeric NOT NULL DEFAULT 0,
  despublicado_em timestamptz, despublicacao_motivo text
);
CREATE VIEW public.financiamento_publico AS
  SELECT id, candidato_id, ano_eleicao, total_arrecadado FROM public.financiamento WHERE despublicado_em IS NULL;
CREATE TABLE public.coleta_log (
  id bigserial PRIMARY KEY, fonte text NOT NULL, escopo text NOT NULL, alvo text NOT NULL,
  candidato_id uuid, executado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL, volume integer NOT NULL, detalhe text, url text,
  execucao text, natureza text NOT NULL DEFAULT 'coleta',
  CONSTRAINT coleta_log_escopo_check CHECK (escopo = ANY (ARRAY['candidato'::text, 'territorio'::text, 'global'::text])),
  CONSTRAINT coleta_log_resultado_check CHECK (resultado = ANY (ARRAY['encontrado'::text, 'vazio_confirmado'::text, 'sem_achado_no_escopo'::text, 'nao_aplicavel'::text, 'erro'::text, 'indeterminado'::text])),
  CONSTRAINT coleta_log_natureza_check CHECK (natureza = ANY (ARRAY['coleta'::text, 'escrita'::text])),
  CONSTRAINT coleta_log_volume_check CHECK (volume >= 0),
  CONSTRAINT coleta_log_candidato_id_so_em_escopo_candidato CHECK ((escopo = 'candidato'::text) OR (candidato_id IS NULL)),
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

INSERT INTO public.candidatos(id, slug) VALUES
  ('c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'alvaro-dias-rn'),
  ('00000000-0000-4000-8000-000000000002', 'ficha-vizinha');

-- As 6 do homonimo (PR), pelos UUID reais do achado.
INSERT INTO public.historico_politico(id, candidato_id, cargo) VALUES
  ('82deee73-8a51-4e0f-9633-64ae7e31efc0', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'homonimo-1'),
  ('f0c8aebd-5fe0-453b-be4e-f630831a0c47', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'homonimo-2'),
  ('23967fae-e035-4c18-bbc3-e5f9a970ecdc', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'homonimo-3'),
  ('b238ad2b-3668-48b7-8cb9-e355da68ec41', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'homonimo-4'),
  ('03d24ea4-b3ce-434b-a72b-0960f95c4520', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'homonimo-5'),
  ('d972c203-0353-4fa0-bfab-c292e807aca3', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'homonimo-6');
-- As 12 do Rio Grande do Norte, que tem de sobreviver inteiras.
INSERT INTO public.historico_politico(id, candidato_id, cargo)
SELECT gen_random_uuid(), 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'rn-' || g FROM generate_series(1, 12) g;
INSERT INTO public.historico_politico(id, candidato_id, cargo)
VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'vizinha-1');

INSERT INTO public.financiamento(id, candidato_id, ano_eleicao, total_arrecadado) VALUES
  ('0332669e-5a46-4b32-b7f8-d23ad5001f48', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 2018, 4200000.00),
  ('c14061ca-7829-4908-becd-c09af5baf5c1', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 2022, 6321995.02);
SQL

before="$(q -Atq -c "SELECT md5(string_agg(t.k, ',' ORDER BY t.k)) FROM (SELECT id::text || '=' || coalesce(despublicado_em::text,'<NULL>') || '/' || coalesce(despublicacao_motivo,'<NULL>') AS k FROM public.historico_politico UNION ALL SELECT id::text || '=' || coalesce(despublicado_em::text,'<NULL>') || '/' || coalesce(despublicacao_motivo,'<NULL>') FROM public.financiamento) t")"
antes_publico="$(q -Atq -c "SELECT coalesce(sum(total_arrecadado),0) FROM public.financiamento_publico WHERE candidato_id='c89aaf3b-a9a7-4a95-856a-5b65df38cc80'")"
[[ "$antes_publico" == "10521995.02" ]] || { echo "FAIL: fixture soma $antes_publico, esperado 10521995.02" >&2; exit 1; }

if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou o pre-estado" >&2; exit 1
fi

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

# O efeito que o leitor ve: o dinheiro do homonimo sai da view publica.
depois_publico="$(q -Atq -c "SELECT coalesce(sum(total_arrecadado),0) FROM public.financiamento_publico WHERE candidato_id='c89aaf3b-a9a7-4a95-856a-5b65df38cc80'")"
[[ "$depois_publico" == "0" ]] || { echo "FAIL: financiamento_publico ainda soma $depois_publico" >&2; exit 1; }
volume="$(q -Atq -c "SELECT volume FROM public.coleta_log WHERE execucao='migration:$VERSION'")"
[[ "$volume" == "8" ]] || { echo "FAIL: recibo com volume $volume, esperado 8" >&2; exit 1; }
chaves="$(q -Atq -c "SELECT count(*) FROM public.coleta_log r, jsonb_each(r.detalhe::jsonb) kv WHERE r.execucao='migration:$VERSION' AND kv.key LIKE 'historico_politico:%'")"
[[ "$chaves" == "6" ]] || { echo "FAIL: recibo com $chaves chaves de historico, esperado 6" >&2; exit 1; }
# A ficha vizinha nao foi tocada.
vizinha="$(q -Atq -c "SELECT count(*) FROM public.historico_politico WHERE candidato_id='00000000-0000-4000-8000-000000000002' AND despublicado_em IS NOT NULL")"
[[ "$vizinha" == "0" ]] || { echo "FAIL: a despublicacao vazou para a ficha vizinha" >&2; exit 1; }

# O ERRO OPOSTO, e o mais caro: comer mandato verdadeiro do RN. O readback tem
# de pegar isso, senao ele so sabe conferir o lado facil.
alvo_rn="$(q -Atq -c "SELECT id FROM public.historico_politico WHERE cargo='rn-1'")"
q -q -c "UPDATE public.historico_politico SET despublicado_em=now(), despublicacao_motivo='engano' WHERE id='$alvo_rn'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou mandato verdadeiro do RN despublicado" >&2; exit 1
fi
q -q -c "UPDATE public.historico_politico SET despublicado_em=NULL, despublicacao_motivo=NULL WHERE id='$alvo_rn'"

# Despublicar sem motivo e apagar sem rastro.
q -q -c "UPDATE public.historico_politico SET despublicacao_motivo='' WHERE id='82deee73-8a51-4e0f-9633-64ae7e31efc0'"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: readback aceitou linha despublicada sem motivo" >&2; exit 1
fi
q -q -c "UPDATE public.historico_politico SET despublicacao_motivo='homonimo (restaurado no teste)' WHERE id='82deee73-8a51-4e0f-9633-64ae7e31efc0'"
q -q < "$READBACK"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260904000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2; exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260904000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

after="$(q -Atq -c "SELECT md5(string_agg(t.k, ',' ORDER BY t.k)) FROM (SELECT id::text || '=' || coalesce(despublicado_em::text,'<NULL>') || '/' || coalesce(despublicacao_motivo,'<NULL>') AS k FROM public.historico_politico UNION ALL SELECT id::text || '=' || coalesce(despublicado_em::text,'<NULL>') || '/' || coalesce(despublicacao_motivo,'<NULL>') FROM public.financiamento) t")"
[[ "$after" == "$before" ]] || { echo "FAIL: rollback nao devolveu a pre-imagem byte a byte" >&2; exit 1; }
volta_publico="$(q -Atq -c "SELECT coalesce(sum(total_arrecadado),0) FROM public.financiamento_publico WHERE candidato_id='c89aaf3b-a9a7-4a95-856a-5b65df38cc80'")"
[[ "$volta_publico" == "10521995.02" ]] || { echo "FAIL: apos o rollback a view soma $volta_publico" >&2; exit 1; }
ledger="$(q -Atq -c "SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations")"
[[ "$ledger" == "$PREVIOUS" ]] || { echo "FAIL: ledger apos rollback = $ledger" >&2; exit 1; }

# Replay a partir de banco sem a ficha: no-op, nao falha.
q -q -c "DELETE FROM public.candidatos"
q -q -c "DELETE FROM public.coleta_log"
q -q < "$MIGRATION"
sobrou="$(q -Atq -c "SELECT count(*) FROM public.coleta_log WHERE execucao='migration:$VERSION'")"
[[ "$sobrou" == "0" ]] || { echo "FAIL: replay sem a ficha gravou recibo ($sobrou)" >&2; exit 1; }

echo "PASS: despublicacao do homonimo tem forward, R\$ 10.521.995,02 saindo da view publica, recibo com as 8 pre-imagens, mandato verdadeiro do RN protegido, motivo obrigatorio, migration posterior, rollback byte a byte e no-op de replay provados em PostgreSQL 17"
