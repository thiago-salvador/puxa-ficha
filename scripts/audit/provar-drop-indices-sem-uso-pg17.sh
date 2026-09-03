#!/usr/bin/env bash
# Prova em PostgreSQL 17 descartavel da migration 20260903120000, que remove os
# 11 indices sem uso. Fixture minima: as sete tabelas com as colunas envolvidas,
# os onze indices criados com o DDL EXATO medido em producao em 03/09/2026, e os
# indices IRMAOS que o readback exige que sobrevivam.
#
# Prova, nesta ordem: readback contra pre-estado (tem de recusar), forward com
# contagem 21 -> 10, idempotencia do forward, adulteracao pelos dois lados
# (indice da lista de volta, e irmao removido), migration posterior bloqueando
# rollback, rollback, readback de rollback e `indexdef` igual byte a byte ao
# estado inicial, com o ledger de volta no predecessor.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
VERSION="20260903120000"
PREVIOUS="20260903100100"
PREVIOUS_DIGEST="sha256:493799435353cbe9b9f074f7b4847bee31c2a8f35bcf6f2a0dbad0992e7e116f"
MIGRATION="supabase/migrations/${VERSION}_drop_indices_sem_uso.sql"
READBACK="supabase/readback/${VERSION}_drop_indices_sem_uso.readback.sql"
ROLLBACK="supabase/rollback/${VERSION}_drop_indices_sem_uso.rollback.sql"
ROLLBACK_READBACK="supabase/readback/${VERSION}_drop_indices_sem_uso.rollback.readback.sql"
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

# As sete tabelas com as colunas que os indices tocam, os irmaos que ficam e os
# onze alvos com o DDL exato de producao. Tipos importam: o `indexdef` que a
# prova compara byte a byte carrega `::text` nas clausulas WHERE.
q -q <<SQL
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
VALUES ('${PREVIOUS}', '${PREVIOUS_DIGEST}');

CREATE TABLE public.alert_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_email_request_ip_hash text,
  last_verification_email_sent_at timestamptz
);
CREATE INDEX idx_alert_subscribers_verified ON public.alert_subscribers (verified, created_at DESC);

CREATE TABLE public.indicadores_estaduais (
  id bigserial PRIMARY KEY,
  estado text NOT NULL,
  ano integer NOT NULL,
  fonte text
);
CREATE INDEX idx_indicadores_estado ON public.indicadores_estaduais (estado);
CREATE INDEX idx_indicadores_fonte ON public.indicadores_estaduais (fonte);

CREATE TABLE public.mudancas_partido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid,
  despublicado_em timestamptz
);
CREATE INDEX idx_mudancas_candidato ON public.mudancas_partido (candidato_id);

CREATE TABLE public.news_refresh_lotes (
  execucao_id uuid NOT NULL,
  cursor integer NOT NULL,
  estado text NOT NULL,
  lease_ate timestamptz,
  continuacao_estado text NOT NULL DEFAULT 'none',
  continuacao_lease_ate timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (execucao_id, cursor)
);

CREATE TABLE public.gastos_executivo (
  id bigserial PRIMARY KEY,
  candidato_id uuid NOT NULL,
  orgao_codigo text,
  mes_extrato text NOT NULL
);
CREATE INDEX gastos_executivo_candidato_mes_idx ON public.gastos_executivo (candidato_id, mes_extrato DESC);

CREATE TABLE public.patrimonio_quarentena (
  candidato_id uuid NOT NULL,
  ano_eleicao integer NOT NULL
);
CREATE TABLE public.financiamento_quarentena (
  candidato_id uuid NOT NULL,
  ano_eleicao integer NOT NULL
);

-- Os onze alvos, com o DDL exato medido em producao (03/09/2026).
CREATE INDEX financiamento_quarentena_candidato_id_ano_eleicao_idx ON public.financiamento_quarentena USING btree (candidato_id, ano_eleicao);
CREATE INDEX gastos_executivo_candidato_orgao_mes_idx ON public.gastos_executivo USING btree (candidato_id, orgao_codigo, mes_extrato DESC);
CREATE INDEX idx_alert_subscribers_email_request_ip_sent_at ON public.alert_subscribers USING btree (last_email_request_ip_hash, last_verification_email_sent_at DESC) WHERE (last_email_request_ip_hash IS NOT NULL);
CREATE INDEX idx_alert_subscribers_last_verification_email_sent_at ON public.alert_subscribers USING btree (last_verification_email_sent_at DESC);
CREATE INDEX idx_indicadores_estado_ano ON public.indicadores_estaduais USING btree (estado, ano);
CREATE INDEX idx_mudancas_partido_despublicado ON public.mudancas_partido USING btree (despublicado_em) WHERE (despublicado_em IS NOT NULL);
CREATE INDEX news_refresh_lotes_continuacao_expired_idx ON public.news_refresh_lotes USING btree (continuacao_lease_ate) WHERE ((estado = 'completed'::text) AND (continuacao_estado = 'dispatching'::text));
CREATE INDEX news_refresh_lotes_continuacao_pending_idx ON public.news_refresh_lotes USING btree (atualizado_em) WHERE ((estado = 'completed'::text) AND (continuacao_estado = 'pending'::text));
CREATE INDEX news_refresh_lotes_processing_expired_idx ON public.news_refresh_lotes USING btree (lease_ate) WHERE (estado = 'processing'::text);
CREATE INDEX news_refresh_lotes_retryable_idx ON public.news_refresh_lotes USING btree (atualizado_em) WHERE (estado = 'retryable'::text);
CREATE INDEX patrimonio_quarentena_candidato_id_ano_eleicao_idx ON public.patrimonio_quarentena USING btree (candidato_id, ano_eleicao);
SQL

TABELAS="'alert_subscribers','financiamento_quarentena','gastos_executivo','indicadores_estaduais','mudancas_partido','news_refresh_lotes','patrimonio_quarentena'"

contar_indices() {
  q -Atq -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename IN ($TABELAS)"
}

assinatura_indices() {
  q -Atq -c "SELECT md5(string_agg(indexname || '=' || indexdef, E'\n' ORDER BY indexname)) FROM pg_indexes WHERE schemaname='public' AND tablename IN ($TABELAS)"
}

antes="$(contar_indices)"
[[ "$antes" == "21" ]] || { echo "FAIL: fixture com $antes indices nas sete tabelas, esperado 21" >&2; exit 1; }
assinatura_antes="$(assinatura_indices)"

# Prova negativa: o readback nao pode aceitar o estado ANTERIOR a migration.
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou o pre-estado" >&2
  exit 1
fi

q -q < "$MIGRATION"
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('$VERSION', 'sha256:fixture')"
q -q < "$READBACK"

depois="$(contar_indices)"
[[ "$depois" == "10" ]] || { echo "FAIL: sobraram $depois indices nas sete tabelas, esperado 10" >&2; exit 1; }
sobrou="$(q -Atq -c "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('financiamento_quarentena_candidato_id_ano_eleicao_idx','gastos_executivo_candidato_orgao_mes_idx','idx_alert_subscribers_email_request_ip_sent_at','idx_alert_subscribers_last_verification_email_sent_at','idx_indicadores_estado_ano','idx_mudancas_partido_despublicado','news_refresh_lotes_continuacao_expired_idx','news_refresh_lotes_continuacao_pending_idx','news_refresh_lotes_processing_expired_idx','news_refresh_lotes_retryable_idx','patrimonio_quarentena_candidato_id_ano_eleicao_idx')")"
[[ "$sobrou" == "0" ]] || { echo "FAIL: $sobrou indice(s) da lista continuam presentes" >&2; exit 1; }

# Idempotencia: rodar de novo nao pode reprovar nem mexer em mais nada.
q -q < "$MIGRATION"
[[ "$(contar_indices)" == "10" ]] || { echo "FAIL: segunda aplicacao mexeu na contagem" >&2; exit 1; }
q -q < "$READBACK"

# Adulteracao 1: um dos onze de volta derruba o readback.
q -q -c "CREATE INDEX idx_indicadores_estado_ano ON public.indicadores_estaduais USING btree (estado, ano)"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou indice da lista de volta" >&2
  exit 1
fi
q -q -c "DROP INDEX public.idx_indicadores_estado_ano"
q -q < "$READBACK"

# Adulteracao 2: um IRMAO removido tambem derruba o readback. E esta a metade
# que responde "nenhum indice a mais foi removido".
q -q -c "DROP INDEX public.idx_indicadores_estado"
if q -q < "$READBACK" >/dev/null 2>&1; then
  echo "FAIL: forward readback aceitou irmao removido" >&2
  exit 1
fi
q -q -c "CREATE INDEX idx_indicadores_estado ON public.indicadores_estaduais (estado)"
q -q < "$READBACK"

# Migration posterior no ledger bloqueia o rollback.
q -q -c "INSERT INTO supabase_migrations.schema_migrations(version, idempotency_key) VALUES ('20260904000000', 'sha256:future')"
if q -q < "$ROLLBACK" >/dev/null 2>&1; then
  echo "FAIL: rollback aceitou migration posterior" >&2
  exit 1
fi
q -q -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20260904000000'"

q -q < "$ROLLBACK"
q -q < "$ROLLBACK_READBACK"

restaurado="$(contar_indices)"
[[ "$restaurado" == "21" ]] || { echo "FAIL: rollback devolveu $restaurado indices, esperado 21" >&2; exit 1; }
assinatura_depois="$(assinatura_indices)"
[[ "$assinatura_depois" == "$assinatura_antes" ]] || { echo "FAIL: indexdef apos rollback difere do estado inicial" >&2; exit 1; }
ledger="$(q -Atq -c "SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations")"
[[ "$ledger" == "$PREVIOUS" ]] || { echo "FAIL: ledger apos rollback = $ledger" >&2; exit 1; }

echo "PASS: 20260903120000 tem forward 21->10, idempotencia, as duas adulteracoes, migration posterior, rollback e indexdef byte a byte provados em PostgreSQL 17 (13 checks)"
