-- Preservador: devolve as oito linhas de historico_politico à preimagem
-- integral gravada no recibo `migration:20260925230000`, com CAS da postimagem.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.historico_politico IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260925230000' THEN
    RAISE EXCEPTION 'hist-federal-20260925 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925230000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925230000' AND volume = 8 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260925230000') THEN
    RAISE EXCEPTION 'hist-federal-20260925 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925230000';
  IF jsonb_array_length(r->'linhas') <> 8 THEN
    RAISE EXCEPTION 'hist-federal-20260925 rollback: recibo sem as oito linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(h) FROM public.historico_politico h WHERE h.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'hist-federal-20260925 rollback: linha % nao esta na postimagem', linha->>'id';
    END IF;

    UPDATE public.historico_politico h
    SET despublicado_em = (linha->'before'->>'despublicado_em')::timestamptz,
        despublicacao_motivo = linha->'before'->>'despublicacao_motivo',
        periodo_inicio = (linha->'before'->>'periodo_inicio')::integer,
        periodo_fim = (linha->'before'->>'periodo_fim')::integer,
        observacoes = linha->'before'->>'observacoes'
    WHERE h.id = (linha->>'id')::uuid;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'hist-federal-20260925 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'id';
    END IF;

    IF (SELECT to_jsonb(h) FROM public.historico_politico h WHERE h.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'hist-federal-20260925 rollback: linha % restaurada nao e a preimagem', linha->>'id';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'hist-federal-20260925'
    AND s.tabela = 'historico_politico';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 8 THEN
    RAISE EXCEPTION 'hist-federal-20260925 rollback: snapshot esperado=8 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'curadoria-historico-federal','global',
         'historico_politico.periodo_inicio,historico_politico.periodo_fim,historico_politico.observacoes,historico_politico.despublicado_em,historico_politico.despublicacao_motivo',
         'encontrado', 8,
         jsonb_build_object(
           'resumo','Rollback da migration 20260925230000: as oito linhas de mandato federal voltam ao estado anterior.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object('id', h.id, 'linha', to_jsonb(h)) ORDER BY h.id)
                      FROM public.historico_politico h
                      WHERE h.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(r->'linhas')))
         )::text,
         'https://dadosabertos.camara.leg.br/api/v2/deputados',
         'rollback:20260925230000','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925230000';
END
$rollback$;
COMMIT;
