-- Preservador: devolve identidade_status da chapa vigente de laudicerio-aguiar
-- à preimagem integral do recibo `migration:20260926180100`, com CAS da
-- postimagem.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926180100' THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926180100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926180100' AND volume = 1 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260926180100') THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926180100';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback: recibo sem a linha da chapa';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(ch) FROM public.chapas_2026 ch WHERE ch.chave = linha->>'chave')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback: % nao esta na postimagem', linha->>'chave';
    END IF;

    UPDATE public.chapas_2026 ch
    SET identidade_status = linha->'before'->>'identidade_status'
    WHERE ch.chave = linha->>'chave';
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'chave';
    END IF;

    IF (SELECT to_jsonb(ch) FROM public.chapas_2026 ch WHERE ch.chave = linha->>'chave')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback: % restaurada nao e a preimagem', linha->>'chave';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'chapa-laudicerio-20260926'
    AND s.tabela = 'chapas_2026';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 rollback: snapshot esperado=1 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global','chapas_2026.identidade_status:laudicerio-aguiar','encontrado', 1,
         jsonb_build_object(
           'resumo','Rollback da migration 20260926180100: a chapa volta a duplicidade_oficial.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object('chave', ch.chave, 'chapa', to_jsonb(ch)))
                      FROM public.chapas_2026 ch
                      WHERE ch.chave IN (SELECT value->>'chave' FROM jsonb_array_elements(r->'linhas')))
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073',
         'rollback:20260926180100','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926180100';
END
$rollback$;
COMMIT;
