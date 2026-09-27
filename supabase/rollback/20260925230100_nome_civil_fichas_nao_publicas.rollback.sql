-- Preservador: devolve nome_completo das dez fichas à preimagem integral do
-- recibo `migration:20260925230100`, com CAS da postimagem.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260925230100' THEN
    RAISE EXCEPTION 'nome-civil-20260925 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925230100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925230100' AND volume = 10 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260925230100') THEN
    RAISE EXCEPTION 'nome-civil-20260925 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925230100';
  IF jsonb_array_length(r->'linhas') <> 10 THEN
    RAISE EXCEPTION 'nome-civil-20260925 rollback: recibo sem as dez linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'nome-civil-20260925 rollback: % nao esta na postimagem', linha->>'slug';
    END IF;

    UPDATE public.candidatos c
    SET nome_completo = linha->'before'->>'nome_completo'
    WHERE c.slug = linha->>'slug';
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'nome-civil-20260925 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;

    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'nome-civil-20260925 rollback: % restaurada nao e a preimagem', linha->>'slug';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'nome-civil-20260925'
    AND s.tabela = 'candidatos';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 10 THEN
    RAISE EXCEPTION 'nome-civil-20260925 rollback: snapshot esperado=10 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'camara','global','candidatos.nome_completo','encontrado', 10,
         jsonb_build_object(
           'resumo','Rollback da migration 20260925230100: nome_completo das dez fichas volta ao valor anterior.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object('slug', c.slug, 'candidato', to_jsonb(c)) ORDER BY c.slug)
                      FROM public.candidatos c
                      WHERE c.slug IN (SELECT value->>'slug' FROM jsonb_array_elements(r->'linhas')))
         )::text,
         'https://dadosabertos.camara.leg.br/api/v2/deputados',
         'rollback:20260925230100','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925230100';
END
$rollback$;
COMMIT;
