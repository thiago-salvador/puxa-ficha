BEGIN;

DO $rollback$
DECLARE quantidade integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260906065729' THEN
    RAISE EXCEPTION 'rollback completude residual: migration posterior ou ledger inesperado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug='well-macedo') THEN
    DELETE FROM supabase_migrations.schema_migrations WHERE version='20260906065729';
    RETURN;
  END IF;

  SELECT count(*) INTO quantidade
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906065729' AND (
    (s.tabela='historico_politico' AND EXISTS(SELECT 1 FROM public.historico_politico t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)) OR
    (s.tabela='mudancas_partido' AND EXISTS(SELECT 1 FROM public.mudancas_partido t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage)) OR
    (s.tabela='financiamento' AND EXISTS(SELECT 1 FROM public.financiamento t WHERE t.id=s.row_id AND to_jsonb(t)=s.postimage))
  );
  IF quantidade<>11 THEN RAISE EXCEPTION 'rollback completude residual: postimages esperadas=11 válidas=%',quantidade; END IF;

  IF (SELECT count(*) FROM public.patrimonio_ausencia_oficial WHERE execucao='migration:20260906065729')<>4 THEN
    RAISE EXCEPTION 'rollback completude residual: ausências oficiais divergiram';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao LIKE 'migration:20260906065729:%')<>5 THEN
    RAISE EXCEPTION 'rollback completude residual: recibos forward divergiram';
  END IF;

  -- @write tabela=historico_politico slug=jeronimo,dr-daniel,joao-campos campos=despublicado_em,despublicacao_motivo
  UPDATE public.historico_politico t
  SET despublicado_em=(s.preimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo=s.preimage->>'despublicacao_motivo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906065729' AND s.tabela='historico_politico'
    AND s.row_id=t.id AND to_jsonb(t)=s.postimage;

  -- @write tabela=mudancas_partido slug=jeronimo,joao-campos campos=despublicado_em,despublicacao_motivo
  UPDATE public.mudancas_partido t
  SET despublicado_em=(s.preimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo=s.preimage->>'despublicacao_motivo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906065729' AND s.tabela='mudancas_partido'
    AND s.row_id=t.id AND to_jsonb(t)=s.postimage;

  -- @write tabela=financiamento slug=jeronimo,dr-daniel,joao-campos campos=despublicado_em,despublicacao_motivo
  UPDATE public.financiamento t
  SET despublicado_em=(s.preimage->>'despublicado_em')::timestamptz,
      despublicacao_motivo=s.preimage->>'despublicacao_motivo'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906065729' AND s.tabela='financiamento'
    AND s.row_id=t.id AND to_jsonb(t)=s.postimage;

  -- @write tabela=patrimonio_ausencia_oficial ref=rollback:20260906065729 campos=remocao_das_quatro_ausencias
  DELETE FROM public.patrimonio_ausencia_oficial WHERE execucao='migration:20260906065729';

  -- @write tabela=coleta_log ref=rollback:20260906065729 campos=remocao_dos_recibos_forward
  DELETE FROM public.coleta_log WHERE execucao LIKE 'migration:20260906065729:%';

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=rollback:20260906065729 campos=remocao_dos_snapshots
  DELETE FROM public.identidade_timeline_quarentena_snapshot WHERE migration_version='20260906065729';

  -- @write tabela=coleta_log ref=rollback:20260906065729 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log(fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  VALUES('rollback-completude-residual','global','homônimos+patrimonio_ausencia_oficial','encontrado',15,
    'Restauradas 11 pré-imagens e removidas 4 ausências oficiais da migration 20260906065729.',
    'https://dadosabertos.tse.jus.br/group/candidatos','rollback:20260906065729','escrita');

  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260906065729';
END
$rollback$;

COMMIT;
