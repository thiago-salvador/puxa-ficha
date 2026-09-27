-- Preservador: devolve as quatro linhas de patrimonio e financiamento de
-- mauricio-coelho à preimagem integral do recibo `migration:20260926233100`,
-- com CAS da postimagem. A trigger de busca por doador reindexa as receitas.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; atual jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260926233100' THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926233100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926233100' AND volume = 4 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260926233100') THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926233100';
  IF jsonb_array_length(r->'linhas') <> 4 THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback: recibo sem as quatro linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF linha->>'tabela' = 'patrimonio' THEN
      SELECT to_jsonb(p) INTO atual FROM public.patrimonio p WHERE p.id = (linha->>'id')::uuid;
    ELSE
      SELECT to_jsonb(f) INTO atual FROM public.financiamento f WHERE f.id = (linha->>'id')::uuid;
    END IF;
    IF atual IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback: linha % nao esta na postimagem', linha->>'id';
    END IF;

    IF linha->>'tabela' = 'patrimonio' THEN
      UPDATE public.patrimonio p
      SET despublicado_em = (linha->'before'->>'despublicado_em')::timestamptz,
          despublicacao_motivo = linha->'before'->>'despublicacao_motivo'
      WHERE p.id = (linha->>'id')::uuid;
      GET DIAGNOSTICS afetadas = ROW_COUNT;
      SELECT to_jsonb(p) INTO atual FROM public.patrimonio p WHERE p.id = (linha->>'id')::uuid;
    ELSE
      UPDATE public.financiamento f
      SET despublicado_em = (linha->'before'->>'despublicado_em')::timestamptz,
          despublicacao_motivo = linha->'before'->>'despublicacao_motivo'
      WHERE f.id = (linha->>'id')::uuid;
      GET DIAGNOSTICS afetadas = ROW_COUNT;
      SELECT to_jsonb(f) INTO atual FROM public.financiamento f WHERE f.id = (linha->>'id')::uuid;
    END IF;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'id';
    END IF;
    IF atual IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback: linha % restaurada nao e a preimagem', linha->>'id';
    END IF;
  END LOOP;

  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'mauricio-homonimo-20260926';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 4 THEN
    RAISE EXCEPTION 'mauricio-homonimo-20260926 rollback: snapshot esperado=4 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-identidade-homonima','global',
         'patrimonio.despublicado_em,patrimonio.despublicacao_motivo,financiamento.despublicado_em,financiamento.despublicacao_motivo',
         'encontrado', 4,
         jsonb_build_object(
           'resumo','Rollback da migration 20260926233100: patrimonio e financiamento de 2012 e 2020 de mauricio-coelho voltam a ser publicados.',
           'linhas', (SELECT jsonb_agg(x ORDER BY x->>'id') FROM (
               SELECT jsonb_build_object('tabela','patrimonio','id', p.id, 'linha', to_jsonb(p)) x
               FROM public.patrimonio p
               WHERE p.id IN ('f65e7932-574f-4377-a27c-334458471b64','e78469f8-de18-4104-aa4c-1a78360228d1')
               UNION ALL
               SELECT jsonb_build_object('tabela','financiamento','id', f.id, 'linha', to_jsonb(f))
               FROM public.financiamento f
               WHERE f.id IN ('7ead02ce-acfd-417d-b482-a0e92f56b801','aacde5cd-aafa-466e-9ad4-cb095c75e5b6')) t)
         )::text,
         'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip',
         'rollback:20260926233100','escrita';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926233100';
END
$rollback$;
COMMIT;
