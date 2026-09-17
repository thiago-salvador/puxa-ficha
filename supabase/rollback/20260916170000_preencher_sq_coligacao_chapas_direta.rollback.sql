-- Reverte 20260916170000: as duas chapas voltam a ter sq_coligacao NULL.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
DECLARE quantidade integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260916170000' THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta rollback: ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260916170000' AND volume=2)<>1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao='rollback:20260916170000') THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta rollback: recibo invalido ou rollback repetido';
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal' AND sq_coligacao = '280001801455')<>1
     OR (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375' AND sq_coligacao = '270001800814')<>1
  THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta rollback: postimagem divergiu';
  END IF;

  UPDATE public.chapas_2026 SET sq_coligacao = NULL
  WHERE chave = '2026:BR:pablo-henrique-costa-marcal' AND sq_coligacao = '280001801455';
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'sq-coligacao-chapas-direta rollback: PRTB count'; END IF;

  UPDATE public.chapas_2026 SET sq_coligacao = NULL
  WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375' AND sq_coligacao = '270001800814';
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'sq-coligacao-chapas-direta rollback: TO count'; END IF;

  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  VALUES ('tse-consulta-cand-2026', 'chapa', 'chapas_2026.sq_coligacao', 'encontrado', 2,
    'Rollback de 20260916170000: sq_coligacao das duas chapas voltou a NULL.',
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
    'rollback:20260916170000', 'escrita');

  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260916170000';
END
$rollback$;
COMMIT;
