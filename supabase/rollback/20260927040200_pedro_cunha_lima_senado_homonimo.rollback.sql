-- Restaura apenas as 33 linhas cuja pós-imagem segue intacta e exige esta
-- migration no topo do ledger.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE s record; atual jsonb; afetadas integer; total integer := 0;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260927040200' THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 rollback: ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260927040200') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260927040200') THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 rollback: recibo invalido ou rollback repetido';
  END IF;
  FOR s IN SELECT * FROM public.identidade_timeline_quarentena_snapshot
           WHERE migration_version = 'pedro-cunha-lima-senado-20260927' LOOP
    SELECT to_jsonb(p) INTO atual FROM public.projetos_lei p WHERE p.id = s.row_id;
    IF atual IS DISTINCT FROM s.postimage THEN
      RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 rollback: linha % divergiu da postimagem', s.row_id;
    END IF;
    UPDATE public.projetos_lei p
    SET despublicado_em = (s.preimage->>'despublicado_em')::timestamptz,
        despublicacao_motivo = s.preimage->>'despublicacao_motivo'
    WHERE p.id = s.row_id;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    SELECT to_jsonb(p) INTO atual FROM public.projetos_lei p WHERE p.id = s.row_id;
    IF afetadas <> 1 OR atual IS DISTINCT FROM s.preimage THEN
      RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 rollback: preimagem nao restaurada em %', s.row_id;
    END IF;
    total := total + 1;
  END LOOP;
  IF total <> 33 THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 rollback: linhas esperadas=33 atual=%', total;
  END IF;
  DELETE FROM public.identidade_timeline_quarentena_snapshot
    WHERE migration_version = 'pedro-cunha-lima-senado-20260927';
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  VALUES
    ('senado-identidade-homonima','global',
     'projetos_lei.despublicado_em,projetos_lei.despublicacao_motivo',
     'encontrado',33,
     '{"resumo":"Rollback de 20260927040200: as 33 linhas voltaram à preimagem."}',
     'https://legis.senado.leg.br/dadosabertos/senador/1757',
     'rollback:20260927040200','escrita');
  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927040200';
END
$rollback$;
COMMIT;
