-- Rollback fechado de 20260903120000 (remocao dos 11 indices sem uso).
--
-- Recria os onze com o DDL EXATO medido em `pg_indexes` em producao em
-- 03/09/2026, antes da remocao, e devolve o ledger ao predecessor
-- 20260903100100. `IF NOT EXISTS` e por idempotencia; a pre-condicao abaixo ja
-- exige que os onze estejam ausentes, entao o rollback so roda uma vez.
--
-- Nao ha pre-imagem de DADO a restaurar: a migration revertida e schema puro e
-- nao escreveu uma linha em tabela nenhuma. O que se restaura aqui e estrutura,
-- e a prova de fidelidade e o `indexdef` byte a byte, conferido no readback de
-- rollback.

BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
  presentes text[];
  alvos text[] := ARRAY[
    'financiamento_quarentena_candidato_id_ano_eleicao_idx',
    'gastos_executivo_candidato_orgao_mes_idx',
    'idx_alert_subscribers_email_request_ip_sent_at',
    'idx_alert_subscribers_last_verification_email_sent_at',
    'idx_indicadores_estado_ano',
    'idx_mudancas_partido_despublicado',
    'news_refresh_lotes_continuacao_expired_idx',
    'news_refresh_lotes_continuacao_pending_idx',
    'news_refresh_lotes_processing_expired_idx',
    'news_refresh_lotes_retryable_idx',
    'patrimonio_quarentena_candidato_id_ano_eleicao_idx'
  ];
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903120000';
  IF ledger_count <> 1 OR ledger_top <> '20260903120000' THEN
    RAISE EXCEPTION 'rollback drop_indices_sem_uso: ledger inesperado (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  SELECT array_agg(nome ORDER BY nome) INTO presentes
  FROM unnest(alvos) AS nome
  WHERE EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = nome
  );
  IF presentes IS NOT NULL THEN
    RAISE EXCEPTION 'rollback drop_indices_sem_uso: estado nao e o pos-migration, indice(s) ainda presentes: %', presentes;
  END IF;
END
$precondition$;

CREATE INDEX IF NOT EXISTS financiamento_quarentena_candidato_id_ano_eleicao_idx
  ON public.financiamento_quarentena USING btree (candidato_id, ano_eleicao);
CREATE INDEX IF NOT EXISTS gastos_executivo_candidato_orgao_mes_idx
  ON public.gastos_executivo USING btree (candidato_id, orgao_codigo, mes_extrato DESC);
CREATE INDEX IF NOT EXISTS idx_alert_subscribers_email_request_ip_sent_at
  ON public.alert_subscribers USING btree (last_email_request_ip_hash, last_verification_email_sent_at DESC)
  WHERE (last_email_request_ip_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_alert_subscribers_last_verification_email_sent_at
  ON public.alert_subscribers USING btree (last_verification_email_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicadores_estado_ano
  ON public.indicadores_estaduais USING btree (estado, ano);
CREATE INDEX IF NOT EXISTS idx_mudancas_partido_despublicado
  ON public.mudancas_partido USING btree (despublicado_em)
  WHERE (despublicado_em IS NOT NULL);
CREATE INDEX IF NOT EXISTS news_refresh_lotes_continuacao_expired_idx
  ON public.news_refresh_lotes USING btree (continuacao_lease_ate)
  WHERE ((estado = 'completed'::text) AND (continuacao_estado = 'dispatching'::text));
CREATE INDEX IF NOT EXISTS news_refresh_lotes_continuacao_pending_idx
  ON public.news_refresh_lotes USING btree (atualizado_em)
  WHERE ((estado = 'completed'::text) AND (continuacao_estado = 'pending'::text));
CREATE INDEX IF NOT EXISTS news_refresh_lotes_processing_expired_idx
  ON public.news_refresh_lotes USING btree (lease_ate)
  WHERE (estado = 'processing'::text);
CREATE INDEX IF NOT EXISTS news_refresh_lotes_retryable_idx
  ON public.news_refresh_lotes USING btree (atualizado_em)
  WHERE (estado = 'retryable'::text);
CREATE INDEX IF NOT EXISTS patrimonio_quarentena_candidato_id_ano_eleicao_idx
  ON public.patrimonio_quarentena USING btree (candidato_id, ano_eleicao);

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260903120000';

DO $postcondition$
DECLARE
  ausentes text[];
  divergentes text[];
  ledger_count integer;
  esperado jsonb := jsonb_build_object(
    'financiamento_quarentena_candidato_id_ano_eleicao_idx',
      'CREATE INDEX financiamento_quarentena_candidato_id_ano_eleicao_idx ON public.financiamento_quarentena USING btree (candidato_id, ano_eleicao)',
    'gastos_executivo_candidato_orgao_mes_idx',
      'CREATE INDEX gastos_executivo_candidato_orgao_mes_idx ON public.gastos_executivo USING btree (candidato_id, orgao_codigo, mes_extrato DESC)',
    'idx_alert_subscribers_email_request_ip_sent_at',
      'CREATE INDEX idx_alert_subscribers_email_request_ip_sent_at ON public.alert_subscribers USING btree (last_email_request_ip_hash, last_verification_email_sent_at DESC) WHERE (last_email_request_ip_hash IS NOT NULL)',
    'idx_alert_subscribers_last_verification_email_sent_at',
      'CREATE INDEX idx_alert_subscribers_last_verification_email_sent_at ON public.alert_subscribers USING btree (last_verification_email_sent_at DESC)',
    'idx_indicadores_estado_ano',
      'CREATE INDEX idx_indicadores_estado_ano ON public.indicadores_estaduais USING btree (estado, ano)',
    'idx_mudancas_partido_despublicado',
      'CREATE INDEX idx_mudancas_partido_despublicado ON public.mudancas_partido USING btree (despublicado_em) WHERE (despublicado_em IS NOT NULL)',
    'news_refresh_lotes_continuacao_expired_idx',
      'CREATE INDEX news_refresh_lotes_continuacao_expired_idx ON public.news_refresh_lotes USING btree (continuacao_lease_ate) WHERE ((estado = ''completed''::text) AND (continuacao_estado = ''dispatching''::text))',
    'news_refresh_lotes_continuacao_pending_idx',
      'CREATE INDEX news_refresh_lotes_continuacao_pending_idx ON public.news_refresh_lotes USING btree (atualizado_em) WHERE ((estado = ''completed''::text) AND (continuacao_estado = ''pending''::text))',
    'news_refresh_lotes_processing_expired_idx',
      'CREATE INDEX news_refresh_lotes_processing_expired_idx ON public.news_refresh_lotes USING btree (lease_ate) WHERE (estado = ''processing''::text)',
    'news_refresh_lotes_retryable_idx',
      'CREATE INDEX news_refresh_lotes_retryable_idx ON public.news_refresh_lotes USING btree (atualizado_em) WHERE (estado = ''retryable''::text)',
    'patrimonio_quarentena_candidato_id_ano_eleicao_idx',
      'CREATE INDEX patrimonio_quarentena_candidato_id_ano_eleicao_idx ON public.patrimonio_quarentena USING btree (candidato_id, ano_eleicao)'
  );
BEGIN
  SELECT array_agg(nome ORDER BY nome) INTO ausentes
  FROM jsonb_object_keys(esperado) AS nome
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = nome
  );
  IF ausentes IS NOT NULL THEN
    RAISE EXCEPTION 'rollback drop_indices_sem_uso: indice(s) nao voltaram: %', ausentes;
  END IF;

  SELECT array_agg(p.indexname ORDER BY p.indexname) INTO divergentes
  FROM pg_indexes p
  WHERE p.schemaname = 'public'
    AND esperado ? p.indexname
    AND p.indexdef IS DISTINCT FROM (esperado ->> p.indexname);
  IF divergentes IS NOT NULL THEN
    RAISE EXCEPTION 'rollback drop_indices_sem_uso: indexdef diferente do medido em producao: %', divergentes;
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903120000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback drop_indices_sem_uso: ledger ainda tem a migration';
  END IF;
END
$postcondition$;

COMMIT;
