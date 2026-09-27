-- Preservador: devolve data_nascimento das cinco fichas e a biografia de
-- silvio-mendes à preimagem gravada no snapshot `nascimento-tse-20260926`, com
-- CAS da postimagem do recibo `migration:20260926233000`.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; antes jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926233000' THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926233000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926233000' AND volume = 5 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260926233000') THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926233000';
  IF jsonb_array_length(r->'linhas') <> 5 THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 rollback: recibo sem as cinco fichas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT jsonb_build_object('data_nascimento', to_jsonb(c)->'data_nascimento', 'biografia', to_jsonb(c)->'biografia')
          FROM public.candidatos c WHERE c.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'nascimento-tse-20260926 rollback: % nao esta na postimagem', linha->>'slug';
    END IF;

    antes := linha->'before';
    UPDATE public.candidatos c
    SET data_nascimento = (antes->>'data_nascimento')::date,
        biografia = antes->>'biografia'
    WHERE c.id = (linha->>'id')::uuid;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'nascimento-tse-20260926 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;

    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = (linha->>'id')::uuid)
         IS DISTINCT FROM (SELECT s.preimage FROM public.identidade_timeline_quarentena_snapshot s
                           WHERE s.migration_version = 'nascimento-tse-20260926'
                             AND s.tabela = 'candidatos' AND s.row_id = (linha->>'id')::uuid) THEN
      RAISE EXCEPTION 'nascimento-tse-20260926 rollback: % restaurada nao e a preimagem', linha->>'slug';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'nascimento-tse-20260926'
    AND s.tabela = 'candidatos';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 5 THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 rollback: snapshot esperado=5 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-consulta-cand','global',
         'candidatos.data_nascimento,candidatos.biografia',
         'encontrado', 5,
         jsonb_build_object(
           'resumo','Rollback da migration 20260926233000: data de nascimento das cinco fichas e biografia de silvio-mendes voltam ao estado anterior.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug,
                        'linha', jsonb_build_object('data_nascimento', to_jsonb(c)->'data_nascimento', 'biografia', to_jsonb(c)->'biografia'))
                        ORDER BY c.slug)
                      FROM public.candidatos c
                      WHERE c.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(r->'linhas')))
         )::text,
         'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
         'rollback:20260926233000','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926233000';
END
$rollback$;
COMMIT;
