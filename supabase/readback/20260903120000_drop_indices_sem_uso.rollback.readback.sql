-- Readback pos-rollback de 20260903120000: os 11 indices voltaram identicos.
--
-- "Identicos" aqui e literal: compara `pg_indexes.indexdef` com o texto exato
-- medido em producao em 03/09/2026, antes da remocao. Recriar um indice com a
-- mesma lista de colunas mas sem a clausula WHERE, ou sem o DESC, passaria num
-- teste de presenca e reprova neste.
DO $readback$
DECLARE
  ledger_count integer;
  ledger_top text;
  ausentes text[];
  divergentes text[];
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
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903120000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback drop_indices_sem_uso: migration ainda no ledger';
  END IF;

  SELECT max(version) INTO ledger_top FROM supabase_migrations.schema_migrations;
  IF ledger_top IS DISTINCT FROM '20260903100100' THEN
    RAISE EXCEPTION 'rollback readback drop_indices_sem_uso: topo do ledger = %, esperado o predecessor 20260903100100', ledger_top;
  END IF;

  SELECT array_agg(nome ORDER BY nome) INTO ausentes
  FROM jsonb_object_keys(esperado) AS nome
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = nome
  );
  IF ausentes IS NOT NULL THEN
    RAISE EXCEPTION 'rollback readback drop_indices_sem_uso: indice(s) ausentes: %', ausentes;
  END IF;

  SELECT array_agg(p.indexname ORDER BY p.indexname) INTO divergentes
  FROM pg_indexes p
  WHERE p.schemaname = 'public'
    AND esperado ? p.indexname
    AND p.indexdef IS DISTINCT FROM (esperado ->> p.indexname);
  IF divergentes IS NOT NULL THEN
    RAISE EXCEPTION 'rollback readback drop_indices_sem_uso: indexdef diferente do medido em producao: %', divergentes;
  END IF;
END
$readback$;
