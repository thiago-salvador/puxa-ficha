#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartável a migration 20260925230000 (histórico de
# mandatos federais): readback reprova o pré-estado, migration reprova
# preimagem adulterada e linha já despublicada, forward e readback, readback
# reprova postimagem adulterada, rollback recusa migration posterior no ledger,
# rollback com readback de rollback, e sentinelas intactas.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
V="20260925230000_historico_mandatos_federais_sem_fonte"
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

falha_esperada() {
  local rotulo="$1" arquivo="$2"
  if q -q < "$arquivo" >/dev/null 2>&1; then
    echo "FAIL: $rotulo" >&2
    exit 1
  fi
}

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
INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key)
VALUES ('20260925163543', 'sha256:fixture');

CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE
);
CREATE TABLE public.historico_politico (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  cargo text NOT NULL,
  cargo_canonico text,
  tipo_evento text,
  periodo_inicio integer,
  periodo_fim integer,
  observacoes text,
  proveniencia text,
  despublicado_em timestamptz,
  despublicacao_motivo text
);
CREATE TABLE public.identidade_timeline_quarentena_snapshot (
  migration_version text NOT NULL,
  tabela text NOT NULL,
  row_id uuid NOT NULL,
  candidato_id uuid,
  preimage jsonb NOT NULL,
  postimage jsonb NOT NULL,
  registrado_em timestamptz NOT NULL,
  PRIMARY KEY (migration_version, tabela, row_id)
);
CREATE TABLE public.coleta_log (
  id bigserial PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid,
  resultado text NOT NULL,
  volume integer NOT NULL,
  detalhe text NOT NULL,
  url text NOT NULL,
  execucao text NOT NULL,
  natureza text,
  executado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.candidatos(id, slug) VALUES
  ('00000000-0000-4000-8000-000000000001','joel-rodrigues'),
  ('00000000-0000-4000-8000-000000000002','ronaldo-caiado'),
  ('00000000-0000-4000-8000-000000000003','cicero-lucena'),
  ('00000000-0000-4000-8000-000000000004','eduardo-braga'),
  ('00000000-0000-4000-8000-000000000005','decio-lima'),
  ('00000000-0000-4000-8000-000000000006','ricardo-ferraco'),
  ('00000000-0000-4000-8000-000000000007','capitao-wagner'),
  ('00000000-0000-4000-8000-000000000008','jose-roberto-arruda');

INSERT INTO public.historico_politico(id, candidato_id, cargo, cargo_canonico, tipo_evento, periodo_inicio, periodo_fim, observacoes, proveniencia) VALUES
  ('b6e88c6c-4cd9-4bc3-9dac-09c8959a8d88','00000000-0000-4000-8000-000000000001','Senador','Senador','mandato',2021,NULL,'Exercício de mandato como suplente no Senado após 2021 (Senado Federal)','manual'),
  ('ccc99323-2c55-4c9d-b7ba-eb13adde9574','00000000-0000-4000-8000-000000000002','Deputado Federal','Deputado Federal','mandato',1995,1998,'Trecho do mandato federal após filiação ao PFL, alinhado ao histórico oficial da Câmara e à candidatura TSE de 1994.','misto'),
  ('ee91942c-35d1-418e-a382-26b2e45cc77e','00000000-0000-4000-8000-000000000003','Senador','Senador','mandato',2003,2011,'Mandato federal no Senado (Senado Federal / TSE)','misto'),
  ('292d7aaf-1a16-4065-8152-6804e8c90d3c','00000000-0000-4000-8000-000000000004','Deputado Federal','Deputado Federal','mandato',1991,2002,'','manual'),
  ('9fb2198a-fa50-4c5b-9113-429e25cb65ac','00000000-0000-4000-8000-000000000005','Deputado Federal','Deputado Federal','mandato',2003,2011,'Mandatos federais (curadoria 19.csv)',NULL),
  ('530a532b-d2e5-4f1f-978f-ff59846372e9','00000000-0000-4000-8000-000000000006','Deputado Federal','Deputado Federal','mandato',1999,2011,'Mandatos consecutivos na Câmara dos Deputados (TSE)','manual'),
  ('e4aa3d93-53f4-41e2-bee2-0bb0a6eb4b36','00000000-0000-4000-8000-000000000007','Deputado Federal','Deputado Federal','mandato',2019,NULL,'Importado automaticamente de Wikidata P39 em 2026-09-15','wikidata'),
  ('8ffbdfc0-1c6c-4918-b059-e581693f5053','00000000-0000-4000-8000-000000000008','Deputado Federal','Deputado Federal','mandato',2002,NULL,'ELEITO (TSE 2002)','tse'),
  -- sentinelas: linhas vizinhas que não podem mudar
  ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000002','Deputado Federal','Deputado Federal','mandato',1991,1995,'','wikidata'),
  ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000003','Senador','Senador','mandato',2008,2015,'','senado');
SQL

digest_tudo() {
  q -Atq -c "SELECT md5(string_agg(row_to_json(h)::text,'' ORDER BY h.id)) FROM public.historico_politico h"
}
digest_sentinelas() {
  q -Atq -c "SELECT md5(string_agg(row_to_json(h)::text,'' ORDER BY h.id)) FROM public.historico_politico h WHERE h.id::text LIKE '00000000-0000-4000-8000-0000000000a%'"
}
tudo_antes="$(digest_tudo)"
sentinelas_antes="$(digest_sentinelas)"

falha_esperada "readback aceitou o pré-estado" "supabase/readback/$V.readback.sql"

q -q -c "UPDATE public.historico_politico SET periodo_fim=2003 WHERE id='530a532b-d2e5-4f1f-978f-ff59846372e9'"
falha_esperada "migration aceitou preimagem adulterada" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.historico_politico SET periodo_fim=2011 WHERE id='530a532b-d2e5-4f1f-978f-ff59846372e9'"
q -q -c "UPDATE public.historico_politico SET despublicado_em=now() WHERE id='b6e88c6c-4cd9-4bc3-9dac-09c8959a8d88'"
falha_esperada "migration aceitou linha já despublicada" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.historico_politico SET despublicado_em=NULL WHERE id='b6e88c6c-4cd9-4bc3-9dac-09c8959a8d88'"
q -q -c "UPDATE public.candidatos SET slug='outro' WHERE id='00000000-0000-4000-8000-000000000004'"
falha_esperada "migration aceitou linha de outra ficha" "supabase/migrations/$V.sql"
q -q -c "UPDATE public.candidatos SET slug='eduardo-braga' WHERE id='00000000-0000-4000-8000-000000000004'"
[[ "$(q -Atq -c "SELECT count(*) FROM public.coleta_log")" == "0" ]] || { echo "FAIL: tentativa abortada deixou recibo" >&2; exit 1; }
[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: fixture mudou antes do forward" >&2; exit 1; }

q -q < "supabase/migrations/$V.sql"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260925230000', 'sha256:fixture')"
q -q < "supabase/readback/$V.readback.sql"

estado="$(q -Atq -F '|' -c "SELECT string_agg(left(id::text,8)||':'||coalesce(periodo_inicio::text,'-')||'-'||coalesce(periodo_fim::text,'-')||':'||(despublicado_em IS NOT NULL), ',' ORDER BY id) FROM public.historico_politico WHERE id::text NOT LIKE '00000000%'")"
esperado="292d7aaf:1991-1995:false,530a532b:1999-2003:false,8ffbdfc0:2002-2006:false,9fb2198a:2007-2019:false,b6e88c6c:2021--:true,ccc99323:1995-1998:true,e4aa3d93:2019-2023:false,ee91942c:2003-2011:true"
[[ "$estado" == "$esperado" ]] || { echo "FAIL: forward inesperado: $estado" >&2; exit 1; }
[[ "$(digest_sentinelas)" == "$sentinelas_antes" ]] || { echo "FAIL: forward tocou sentinela" >&2; exit 1; }

q -q -c "UPDATE public.historico_politico SET periodo_fim=NULL WHERE id='e4aa3d93-53f4-41e2-bee2-0bb0a6eb4b36'"
falha_esperada "readback aceitou postimagem adulterada" "supabase/readback/$V.readback.sql"
q -q -c "UPDATE public.historico_politico SET periodo_fim=2023 WHERE id='e4aa3d93-53f4-41e2-bee2-0bb0a6eb4b36'"
q -q < "supabase/readback/$V.readback.sql"

q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260930000000', 'sha256:future')"
falha_esperada "rollback aceitou migration posterior" "supabase/rollback/$V.rollback.sql"
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260930000000'"

q -q < "supabase/rollback/$V.rollback.sql"
q -q < "supabase/readback/$V.rollback.readback.sql"

[[ "$(digest_tudo)" == "$tudo_antes" ]] || { echo "FAIL: rollback não devolveu o estado inicial" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT max(version) FROM supabase_migrations.schema_migrations")" == "20260925163543" ]] || { echo "FAIL: ledger final" >&2; exit 1; }
[[ "$(q -Atq -c "SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot")" == "0" ]] || { echo "FAIL: snapshot sobrou" >&2; exit 1; }

echo "PASS: histórico de mandatos federais tem pré-estado, adulteração, linha já despublicada, outra ficha, forward, readback, migration posterior, rollback e sentinelas provados em PostgreSQL 17"
