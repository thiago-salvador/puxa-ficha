-- Readback de 20260903120000: os 11 indices sem uso sairam, e so eles.
--
-- Tres perguntas, nesta ordem:
--   1. o ledger tem a migration no topo;
--   2. nenhum dos onze existe mais em `pg_indexes`;
--   3. os indices IRMAOS das mesmas sete tabelas continuam onde estavam.
--
-- A pergunta 3 e a que responde "nenhum indice a mais foi removido" de um jeito
-- que se sustenta sozinho, sem depender do estado anterior: a lista congelada
-- abaixo e a dos indices que as PROPRIAS migrations deste repositorio criam
-- nessas tabelas e que NAO estao na lista de remocao. Se o DROP tivesse pegado
-- largo, algum deles teria sumido junto.
--
-- A comparacao exata de contagem antes/depois nao cabe aqui e nem precisa: ela
-- e feita dentro da propria transacao da migration (bloco `$conferencia$`, que
-- guarda o retrato do antes numa temp table e reprova qualquer sumico fora da
-- lista) e de novo na prova em PostgreSQL 17, que mede as sete tabelas antes e
-- depois com a fixture inteira na mao.
DO $readback$
DECLARE
  ledger_count integer;
  ledger_top text;
  restantes text[];
  irmaos_sumidos text[];
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
  -- Irmaos criados pelas migrations do repositorio nas mesmas sete tabelas.
  irmaos text[] := ARRAY[
    'alert_subscribers_pkey',                 -- 20260406150000
    'idx_alert_subscribers_verified',         -- 20260406150000
    'idx_indicadores_estado',                 -- 20260331031013
    'idx_indicadores_fonte',                  -- 20260331031013
    'idx_mudancas_candidato',                 -- 20260329000000
    'gastos_executivo_candidato_mes_idx',     -- 20260816014600
    'news_refresh_lotes_pkey'                 -- 20260806084742
  ];
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903120000';
  IF ledger_count <> 1 OR ledger_top <> '20260903120000' THEN
    RAISE EXCEPTION 'readback drop_indices_sem_uso: ledger sem a migration no topo (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  SELECT array_agg(nome ORDER BY nome) INTO restantes
  FROM unnest(alvos) AS nome
  WHERE EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = nome
  );
  IF restantes IS NOT NULL THEN
    RAISE EXCEPTION 'readback drop_indices_sem_uso: indice(s) da lista continuam presentes: %', restantes;
  END IF;

  SELECT array_agg(nome ORDER BY nome) INTO irmaos_sumidos
  FROM unnest(irmaos) AS nome
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = nome
  );
  IF irmaos_sumidos IS NOT NULL THEN
    RAISE EXCEPTION 'readback drop_indices_sem_uso: indice(s) fora da lista de remocao sumiram: %', irmaos_sumidos;
  END IF;
END
$readback$;
