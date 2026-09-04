-- Rollback fechado de 20260903220000 (despublicacao logica das 6 linhas de
-- historico e das 2 de financiamento do homonimo na ficha alvaro-dias-rn).
--
-- A pre-imagem vem do recibo que a migration gravou em coleta_log
-- (execucao = 'migration:20260903220000', detalhe = JSON "tabela:id" ->
-- {despublicado_em, despublicacao_motivo}). Zerar os dois campos "porque eram
-- NULL" seria adivinhacao, e apagaria curadoria de terceiro se algum motivo ja
-- existisse antes.
--
-- Reverter isto REPUBLICA trajetoria e dinheiro de campanha de OUTRA PESSOA na
-- ficha. So faz sentido se a prova de homonimia cair.

BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
  receipt_count integer;
  rollback_receipt_count integer;
  hist_fora integer;
  fin_fora integer;
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903220000';
  IF ledger_count <> 1 OR ledger_top <> '20260903220000' THEN
    RAISE EXCEPTION 'rollback alvaro-dias-rn homonimo: ledger inesperado (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903220000' AND detalhe IS NOT NULL;
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'rollback alvaro-dias-rn homonimo: recibo de pre-imagem ausente ou duplicado (%)', receipt_count;
  END IF;

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE execucao = 'rollback:20260903220000';
  IF rollback_receipt_count <> 0 THEN
    RAISE EXCEPTION 'rollback alvaro-dias-rn homonimo: rollback ja executado';
  END IF;

  SELECT count(*) INTO hist_fora FROM public.historico_politico
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL;
  SELECT count(*) INTO fin_fora FROM public.financiamento
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL;
  IF hist_fora <> 6 OR fin_fora <> 2 THEN
    RAISE EXCEPTION 'rollback alvaro-dias-rn homonimo: estado nao e o pos-migration (historico=%, financiamento=%)', hist_fora, fin_fora;
  END IF;
END
$precondition$;

-- @write tabela=historico_politico ref=rollback:20260903220000 campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico h
SET despublicado_em = (pre.valor ->> 'despublicado_em')::timestamptz,
    despublicacao_motivo = pre.valor ->> 'despublicacao_motivo'
FROM (
  SELECT split_part(kv.key, ':', 1) AS tabela,
         (split_part(kv.key, ':', 2))::uuid AS id,
         kv.value AS valor
  FROM public.coleta_log r,
       jsonb_each(r.detalhe::jsonb) AS kv
  WHERE r.execucao = 'migration:20260903220000'
) pre
WHERE pre.tabela = 'historico_politico' AND h.id = pre.id;

-- @write tabela=financiamento ref=rollback:20260903220000 campos=despublicado_em,despublicacao_motivo
UPDATE public.financiamento f
SET despublicado_em = (pre.valor ->> 'despublicado_em')::timestamptz,
    despublicacao_motivo = pre.valor ->> 'despublicacao_motivo'
FROM (
  SELECT split_part(kv.key, ':', 1) AS tabela,
         (split_part(kv.key, ':', 2))::uuid AS id,
         kv.value AS valor
  FROM public.coleta_log r,
       jsonb_each(r.detalhe::jsonb) AS kv
  WHERE r.execucao = 'migration:20260903220000'
) pre
WHERE pre.tabela = 'financiamento' AND f.id = pre.id;

-- @write tabela=coleta_log ref=rollback:20260903220000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'despublicacao-homonimo', 'candidato', 'historico_politico+financiamento.despublicado_em',
       'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid,
       CASE WHEN r.volume > 0 THEN 'encontrado' ELSE 'vazio_confirmado' END,
       r.volume,
       'Rollback de 20260903220000: ' || r.volume || ' linha(s) republicadas pela pre-imagem',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2022',
       'rollback:20260903220000',
       'escrita'
FROM public.coleta_log r
WHERE r.execucao = 'migration:20260903220000';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260903220000';

DO $postcondition$
DECLARE
  divergentes integer;
  ledger_count integer;
BEGIN
  -- A conferencia le o estado ATUAL das duas tabelas por UNION e casa por
  -- (tabela, id) com o recibo. Um LEFT JOIN com coalesce seria mais curto e
  -- estaria errado: linha apagada viraria NULL, e NULL bateria com a pre-imagem
  -- NULL, deixando o rollback verde sobre uma linha que sumiu.
  SELECT count(*) INTO divergentes
  FROM (
    SELECT split_part(kv.key, ':', 1) AS tabela,
           (split_part(kv.key, ':', 2))::uuid AS id,
           kv.value AS valor
    FROM public.coleta_log r,
         jsonb_each(r.detalhe::jsonb) AS kv
    WHERE r.execucao = 'migration:20260903220000'
  ) pre
  LEFT JOIN (
    SELECT 'historico_politico'::text AS tabela, id, despublicado_em, despublicacao_motivo
      FROM public.historico_politico
    UNION ALL
    SELECT 'financiamento'::text, id, despublicado_em, despublicacao_motivo
      FROM public.financiamento
  ) atual ON atual.tabela = pre.tabela AND atual.id = pre.id
  WHERE atual.id IS NULL
     OR atual.despublicado_em IS DISTINCT FROM (pre.valor ->> 'despublicado_em')::timestamptz
     OR atual.despublicacao_motivo IS DISTINCT FROM (pre.valor ->> 'despublicacao_motivo');
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback alvaro-dias-rn homonimo: % linha(s) nao voltaram a pre-imagem', divergentes;
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903220000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback alvaro-dias-rn homonimo: ledger ainda tem a migration';
  END IF;
END
$postcondition$;

COMMIT;
