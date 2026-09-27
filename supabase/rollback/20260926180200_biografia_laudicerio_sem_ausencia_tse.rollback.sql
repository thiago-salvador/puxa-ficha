-- Preservador: devolve a biografia de laudicerio-aguiar à preimagem integral
-- do recibo `migration:20260926180200`, com CAS da postimagem.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926180200' THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926180200') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926180200' AND volume = 1 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260926180200') THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926180200';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 rollback: recibo sem a linha da ficha';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'bio-laudicerio-20260926 rollback: % nao esta na postimagem', linha->>'slug';
    END IF;

    UPDATE public.candidatos c
    SET biografia = linha->'before'->>'biografia'
    WHERE c.slug = linha->>'slug';
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'bio-laudicerio-20260926 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;

    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'bio-laudicerio-20260926 rollback: % restaurada nao e a preimagem', linha->>'slug';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'bio-laudicerio-20260926'
    AND s.tabela = 'candidatos';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 rollback: snapshot esperado=1 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global','candidatos.biografia:laudicerio-aguiar','encontrado', 1,
         jsonb_build_object(
           'resumo','Rollback da migration 20260926180200: a biografia volta ao texto anterior.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object('slug', c.slug, 'candidato', to_jsonb(c)))
                      FROM public.candidatos c
                      WHERE c.slug IN (SELECT value->>'slug' FROM jsonb_array_elements(r->'linhas')))
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073',
         'rollback:20260926180200','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926180200';
END
$rollback$;
COMMIT;
