-- Preservador: devolve situacao_candidatura e ultima_atualizacao de
-- godeiro-linharess e laudicerio-aguiar à preimagem integral do recibo
-- `migration:20260926180000`, com CAS da postimagem.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926180000' THEN
    RAISE EXCEPTION 'situacao-gov-20260926 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926180000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926180000' AND volume = 2 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260926180000') THEN
    RAISE EXCEPTION 'situacao-gov-20260926 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926180000';
  IF jsonb_array_length(r->'linhas') <> 2 THEN
    RAISE EXCEPTION 'situacao-gov-20260926 rollback: recibo sem as duas linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'situacao-gov-20260926 rollback: % nao esta na postimagem', linha->>'slug';
    END IF;

    UPDATE public.candidatos c
    SET situacao_candidatura = linha->'before'->>'situacao_candidatura',
        ultima_atualizacao = (linha->'before'->>'ultima_atualizacao')::timestamptz
    WHERE c.slug = linha->>'slug';
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'situacao-gov-20260926 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;

    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'situacao-gov-20260926 rollback: % restaurada nao e a preimagem', linha->>'slug';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'situacao-gov-20260926'
    AND s.tabela = 'candidatos';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 2 THEN
    RAISE EXCEPTION 'situacao-gov-20260926 rollback: snapshot esperado=2 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global','candidatos.situacao_candidatura','encontrado', 2,
         jsonb_build_object(
           'resumo','Rollback da migration 20260926180000: situacao_candidatura e ultima_atualizacao das duas fichas voltam ao valor anterior.',
           'linhas', (SELECT jsonb_agg(jsonb_build_object('slug', c.slug, 'candidato', to_jsonb(c)) ORDER BY c.slug)
                      FROM public.candidatos c
                      WHERE c.slug IN (SELECT value->>'slug' FROM jsonb_array_elements(r->'linhas')))
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073',
         'rollback:20260926180000','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926180000';
END
$rollback$;
COMMIT;
