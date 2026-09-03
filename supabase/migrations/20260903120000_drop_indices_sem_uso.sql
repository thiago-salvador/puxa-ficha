-- Remove 11 indices que nunca foram lidos desde 12/02/2026.
--
-- EVIDENCIA (medida em producao, leitura pura, 03/09/2026): `idx_scan = 0` em
-- `pg_stat_user_indexes` para os onze desde o `stats_reset` de 2026-02-12, ou
-- seja, quase sete meses de trafego real sem uma unica leitura. O advisor
-- `unused_index` do Supabase aponta o mesmo conjunto. Indice que nunca e lido
-- nao acelera consulta nenhuma e mesmo assim e mantido em todo INSERT, UPDATE
-- e DELETE da tabela, ocupa disco e entra em todo backup.
--
-- O QUE ESTA MIGRATION NAO PODE MUDAR: resultado de consulta. Nenhum dos onze
-- e UNIQUE, nenhum sustenta PRIMARY KEY, FOREIGN KEY ou EXCLUDE constraint
-- (todos aparecem como `CREATE INDEX` simples em `pg_indexes`), e indice
-- parcial so restringe QUAIS linhas o planejador alcanca por aquele caminho,
-- nunca quais linhas a consulta devolve. Quatro dos onze sao parciais
-- (`news_refresh_lotes`) e mais dois tambem (`alert_subscribers` por IP e
-- `mudancas_partido` por `despublicado_em`); para todos eles o que muda e o
-- plano, nao a resposta.
--
-- CONFERENCIA DE CODIGO feita antes de escrever, com grep em `src/` e
-- `scripts/` por cada tabela e cada coluna dos indices:
--
--   * `alert_subscribers`: `src/app/api/alerts/subscribe/route.ts` filtra por
--     `last_email_request_ip_hash` e `last_verification_email_sent_at` no teto
--     duravel por IP. A consulta existe e continua correta; o que a medicao
--     diz e que o planejador nunca escolheu estes dois indices para ela, que e
--     o esperado no tamanho atual da tabela. `idx_alert_subscribers_verified`
--     FICA.
--   * `news_refresh_lotes`: os quatro indices parciais nasceram com a tabela em
--     20260806084742, para o cron de noticias (lease de `processing` expirado,
--     `retryable`, e as duas filas de continuacao). As funcoes continuam
--     consultando esses estados; o volume da tabela nunca justificou o indice.
--     A PRIMARY KEY (execucao_id, cursor) FICA.
--   * `gastos_executivo`: `gastos_executivo_candidato_orgao_mes_idx` e de
--     20260820010000, quando o grao mensal ainda era por orgao. O caminho vivo
--     hoje e `gastos_executivo_candidato_mes_idx`, de 20260816014600, que FICA.
--   * `indicadores_estaduais`: `src/lib/api.ts` le por ficha e por `estado`.
--     `idx_indicadores_estado` e `idx_indicadores_fonte` FICAM; so o composto
--     (estado, ano) nunca foi usado.
--   * `mudancas_partido`: nenhum ponto de `src/` consulta `despublicado_em`
--     desta tabela. `idx_mudancas_candidato` FICA.
--   * `patrimonio_quarentena` e `financiamento_quarentena`: as duas nasceram em
--     20260730170000 por `LIKE ... INCLUDING ALL`, e herdaram indice das
--     tabelas de origem com nome gerado pelo Postgres. Sao tabelas de
--     quarentena, escritas por curadoria e lidas a olho; nenhum caminho de
--     produto passa por elas.
--
-- Nenhum indice foi excluido da lista: os onze passaram os dois testes (nao
-- sustentam constraint e nao sao citados por nome em codigo de produto).
--
-- Uma leitura de historico ficou registrada porque nomeia um dos onze e nao
-- muda nada aqui: o readback de 20260811102000 confere que
-- `idx_mudancas_partido_despublicado` existe. Aquele arquivo e o recibo de uma
-- migration ja aplicada em 11/08 e so e executado pela prova em PostgreSQL 17
-- dela, que monta a propria fixture; ele nao volta a rodar contra producao.
--
-- Schema puro: nenhum statement de escrita em tabela de conteudo, por isso
-- entra no replay de estrutura. Predecessor no ledger: 20260903100100.
BEGIN;

-- Retrato do ANTES, para que a conferencia no fim do arquivo possa provar que
-- so os onze sairam. Sem ele, `DROP INDEX IF EXISTS` daria verde tambem num
-- banco onde alguem ja tivesse removido outra coisa.
CREATE TEMP TABLE _indices_antes_20260903120000 ON COMMIT DROP AS
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'alert_subscribers',
    'financiamento_quarentena',
    'gastos_executivo',
    'indicadores_estaduais',
    'mudancas_partido',
    'news_refresh_lotes',
    'patrimonio_quarentena'
  );

DROP INDEX IF EXISTS public.financiamento_quarentena_candidato_id_ano_eleicao_idx;
DROP INDEX IF EXISTS public.gastos_executivo_candidato_orgao_mes_idx;
DROP INDEX IF EXISTS public.idx_alert_subscribers_email_request_ip_sent_at;
DROP INDEX IF EXISTS public.idx_alert_subscribers_last_verification_email_sent_at;
DROP INDEX IF EXISTS public.idx_indicadores_estado_ano;
DROP INDEX IF EXISTS public.idx_mudancas_partido_despublicado;
DROP INDEX IF EXISTS public.news_refresh_lotes_continuacao_expired_idx;
DROP INDEX IF EXISTS public.news_refresh_lotes_continuacao_pending_idx;
DROP INDEX IF EXISTS public.news_refresh_lotes_processing_expired_idx;
DROP INDEX IF EXISTS public.news_refresh_lotes_retryable_idx;
DROP INDEX IF EXISTS public.patrimonio_quarentena_candidato_id_ano_eleicao_idx;

-- ---------------------------------------------------------------------------
-- Conferencia. `DROP INDEX IF EXISTS` e mudo por construcao: ele nao distingue
-- "removi" de "nao existia" e nao percebe se algo alem da lista sumiu. As tres
-- perguntas abaixo sao as que interessam, e as tres falham alto.
DO $conferencia$
DECLARE
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
  restantes text[];
  a_mais text[];
  novos text[];
  removidos integer;
BEGIN
  -- 1. Nenhum dos onze pode ter sobrado.
  SELECT array_agg(nome ORDER BY nome) INTO restantes
  FROM unnest(alvos) AS nome
  WHERE EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = nome
  );
  IF restantes IS NOT NULL THEN
    RAISE EXCEPTION 'drop_indices_sem_uso: indice(s) da lista continuam presentes: %', restantes;
  END IF;

  -- 2. Nada alem dos onze pode ter sumido das sete tabelas.
  SELECT array_agg(a.indexname ORDER BY a.indexname) INTO a_mais
  FROM _indices_antes_20260903120000 a
  WHERE NOT (a.indexname = ANY (alvos))
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes p
      WHERE p.schemaname = 'public' AND p.indexname = a.indexname
    );
  IF a_mais IS NOT NULL THEN
    RAISE EXCEPTION 'drop_indices_sem_uso: indice(s) fora da lista foram removidos: %', a_mais;
  END IF;

  -- 3. E nada pode ter aparecido no lugar, que seria recriacao disfarcada.
  SELECT array_agg(p.indexname ORDER BY p.indexname) INTO novos
  FROM pg_indexes p
  WHERE p.schemaname = 'public'
    AND p.tablename IN (
      'alert_subscribers', 'financiamento_quarentena', 'gastos_executivo',
      'indicadores_estaduais', 'mudancas_partido', 'news_refresh_lotes',
      'patrimonio_quarentena'
    )
    AND NOT EXISTS (
      SELECT 1 FROM _indices_antes_20260903120000 a WHERE a.indexname = p.indexname
    );
  IF novos IS NOT NULL THEN
    RAISE EXCEPTION 'drop_indices_sem_uso: indice(s) inesperado(s) apareceram: %', novos;
  END IF;

  SELECT count(*) INTO removidos
  FROM _indices_antes_20260903120000 a
  WHERE a.indexname = ANY (alvos);
  RAISE NOTICE 'drop_indices_sem_uso: % de 11 indices existiam e foram removidos', removidos;
END
$conferencia$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select indexname from pg_indexes
--    where schemaname = 'public'
--      and tablename in ('alert_subscribers','financiamento_quarentena',
--                        'gastos_executivo','indicadores_estaduais',
--                        'mudancas_partido','news_refresh_lotes',
--                        'patrimonio_quarentena')
--    order by tablename, indexname;
--
-- Se algum dos onze voltar a ser necessario, o rollback versionado recria os
-- onze com o DDL exato medido em producao em 03/09/2026.
