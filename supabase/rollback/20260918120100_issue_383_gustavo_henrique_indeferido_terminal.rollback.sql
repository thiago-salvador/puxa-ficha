-- Preservador: devolve gustavo-henrique a 'indeferido com recurso',
-- status='candidato' e publicavel=true, com CAS da postimagem integral gravada
-- no recibo `migration:20260918120100`. A ficha volta ao ar exatamente como
-- estava antes da migration.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260918120100' THEN
    RAISE EXCEPTION 'issue-383 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log
       WHERE execucao = 'migration:20260918120100' AND volume = 1 AND resultado = 'encontrado') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260918120100') THEN
    RAISE EXCEPTION 'issue-383 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260918120100';

  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'gustavo-henrique')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-383 rollback: estado atual nao e a postimagem da migration';
  END IF;

  UPDATE public.candidatos c
  SET situacao_candidatura = r->'before'->>'situacao_candidatura',
      status = r->'before'->>'status',
      publicavel = (r->'before'->>'publicavel')::boolean,
      ultima_atualizacao = (r->'before'->>'ultima_atualizacao')::timestamptz
  WHERE c.slug = 'gustavo-henrique';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'issue-383 rollback: escrita esperada=1 atual=%', afetadas;
  END IF;

  -- Cardinalidade conferida: a chave e (migration_version,tabela,row_id), entao
  -- 'issue-383-gustavo-henrique-terminal' pode ter zero ou varias linhas. Zero
  -- significa que a migration nao gravou o snapshot; mais de uma, que alguem
  -- escreveu por outro caminho. Nos dois casos o rollback pararia aqui em vez
  -- de gravar recibo e derrubar o ledger em cima de um estado que nao conhece.
  DELETE FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version = 'issue-383-gustavo-henrique-terminal';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'issue-383 rollback: snapshot esperado=1 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura,candidatos.status,candidatos.publicavel',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Rollback da migration 20260918120100: ficha gustavo-henrique volta ao ar como "indeferido com recurso".',
           'candidato', (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'gustavo-henrique')
         )::text,
         'https://divulgacandcontas.tse.jus.br/ (detalhe SQ 180002550421)',
         'rollback:20260918120100','escrita';

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'gustavo-henrique'
      AND situacao_candidatura = 'indeferido com recurso'
      AND status = 'candidato'
      AND publicavel IS TRUE
  ) THEN
    RAISE EXCEPTION 'issue-383 rollback: ficha nao voltou ao estado anterior';
  END IF;

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260918120100';
END
$rollback$;
COMMIT;
