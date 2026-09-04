-- Rollback fechado de 20260903200000 (backfill de sq_candidato_2026 nas duas
-- fichas das ondas de agosto).
--
-- A pre-imagem vem do recibo que a migration gravou em coleta_log
-- (execucao = 'migration:20260903200000', detalhe = JSON id -> valor anterior).
-- Devolver NULL "porque era NULL" seria adivinhacao: o recibo e quem sabe.

BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
  receipt_count integer;
  rollback_receipt_count integer;
  gravados integer;
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903200000';
  IF ledger_count <> 1 OR ledger_top <> '20260903200000' THEN
    RAISE EXCEPTION 'rollback backfill sq ondas agosto: ledger inesperado (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903200000' AND detalhe IS NOT NULL;
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'rollback backfill sq ondas agosto: recibo de pre-imagem ausente ou duplicado (%)', receipt_count;
  END IF;

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE execucao = 'rollback:20260903200000';
  IF rollback_receipt_count <> 0 THEN
    RAISE EXCEPTION 'rollback backfill sq ondas agosto: rollback ja executado';
  END IF;

  -- O estado atual tem de ser o POS-migration. Reverter um banco que ja esta na
  -- pre-imagem, ou que alguem mexeu por fora, e como o rollback apaga trabalho
  -- de terceiro.
  SELECT count(*) INTO gravados
    FROM public.candidatos
   WHERE (slug, sq_candidato_2026) IN (
           ('well-macedo', '140002554108'),
           ('rico-pinheiro', '70002553982'));
  IF gravados <> 2 THEN
    RAISE EXCEPTION 'rollback backfill sq ondas agosto: esperava as 2 linhas no estado pos-migration, encontrei %', gravados;
  END IF;
END
$precondition$;

-- @write tabela=candidatos ref=rollback:20260903200000 campos=sq_candidato_2026
UPDATE public.candidatos c
SET sq_candidato_2026 = pre.valor
FROM (
  SELECT (kv.key)::uuid AS id, kv.value AS valor
  FROM public.coleta_log r,
       jsonb_each_text(r.detalhe::jsonb) AS kv
  WHERE r.execucao = 'migration:20260903200000'
) pre
WHERE c.id = pre.id;

-- @write tabela=coleta_log ref=rollback:20260903200000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'backfill-sq-ondas-agosto', 'global', 'candidatos.sq_candidato_2026',
       CASE WHEN r.volume > 0 THEN 'encontrado' ELSE 'vazio_confirmado' END,
       r.volume,
       'Rollback de 20260903200000: ' || r.volume || ' linha(s) devolvidas ao sq_candidato_2026 anterior pela pre-imagem',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2026',
       'rollback:20260903200000',
       'escrita'
FROM public.coleta_log r
WHERE r.execucao = 'migration:20260903200000';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260903200000';

DO $postcondition$
DECLARE
  divergentes integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO divergentes
  FROM public.coleta_log r,
       jsonb_each_text(r.detalhe::jsonb) AS kv
  JOIN public.candidatos c ON c.id = (kv.key)::uuid
  WHERE r.execucao = 'migration:20260903200000'
    AND c.sq_candidato_2026 IS DISTINCT FROM kv.value;
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback backfill sq ondas agosto: % linha(s) nao voltaram a pre-imagem', divergentes;
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903200000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback backfill sq ondas agosto: ledger ainda tem a migration';
  END IF;
END
$postcondition$;

COMMIT;
