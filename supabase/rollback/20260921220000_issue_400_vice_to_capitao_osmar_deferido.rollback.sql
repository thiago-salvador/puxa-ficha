-- Preservador: devolve o subobjeto fonte_detalhe.vice da chapa
-- 2026:TO:jose-wilson-siqueira-campos-junior:270002554375 ao estado de 17/09 ("Pendente de julgamento"),
-- com CAS da postimagem integral gravada no recibo `migration:20260921220000`.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260921220000' THEN
    RAISE EXCEPTION 'issue-400-vice-to rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260921220000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260921220000' AND volume = 1 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260921220000') THEN
    RAISE EXCEPTION 'issue-400-vice-to rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260921220000';

  IF (SELECT to_jsonb(c) FROM public.chapas_2026 c WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-400-vice-to rollback: estado atual nao e a postimagem da migration';
  END IF;

  UPDATE public.chapas_2026 c
  SET fonte_detalhe = r->'before'->'fonte_detalhe'
  WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'issue-400-vice-to rollback: escrita esperada=1 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global','chapas_2026.fonte_detalhe.vice','encontrado',1,
         jsonb_build_object(
           'resumo','Rollback da migration 20260921220000: vice CAPITAO OSMAR volta a "Pendente de julgamento".',
           'chapa', (SELECT to_jsonb(c) FROM public.chapas_2026 c WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375')
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554376','rollback:20260921220000','escrita';

  IF (SELECT to_jsonb(c) FROM public.chapas_2026 c WHERE c.chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375')
       IS DISTINCT FROM r->'before' THEN
    RAISE EXCEPTION 'issue-400-vice-to rollback: chapa nao voltou ao estado anterior';
  END IF;

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260921220000';
END
$rollback$;
COMMIT;
