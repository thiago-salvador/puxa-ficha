-- Reverte 20260917000001: chapa do PRTB volta ao texto de 15/09/2026.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
DECLARE
  quantidade integer;
  titular_sha text := '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad';
  titular_checked_at timestamptz := timestamptz '2026-09-15T15:04:36.472Z';
  vice_sha text := 'e2a45d22429fb28baa6d075592de32ceba85f9eccec4c309bf564c6ee8360e02';
  vice_checked_at timestamptz := timestamptz '2026-09-15T15:04:36.528Z';
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260917000001' THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb rollback: ledger divergiu';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260917000001' AND volume=1)<>1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao='rollback:20260917000001') THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb rollback: recibo invalido ou rollback repetido';
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_tipo = 'divulgacand_detalhe'
         AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento'
         AND tse_situacao_codigo = 'Pendente de julgamento'
         AND fonte_sha256 = '111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c') <> 1
  THEN
    RAISE EXCEPTION 'fonte-detalhe-prtb rollback: postimagem divergiu';
  END IF;

  UPDATE public.chapas_2026
  SET
    fonte_detalhe = jsonb_set(
      jsonb_set(
        fonte_detalhe,
        '{titular}',
        (fonte_detalhe->'titular') || jsonb_build_object(
          'descricao_situacao', 'Aguardando julgamento',
          'sha256', titular_sha,
          'checked_at', to_char(titular_checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      ),
      '{vice}',
      (fonte_detalhe->'vice') || jsonb_build_object(
        'descricao_situacao', 'Aguardando julgamento',
        'sha256', vice_sha,
        'checked_at', to_char(vice_checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ),
    fonte_sha256 = titular_sha,
    snapshot_em = titular_checked_at,
    tse_situacao_codigo = 'Aguardando julgamento'
  WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
    AND fonte_tipo = 'divulgacand_detalhe';
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN RAISE EXCEPTION 'fonte-detalhe-prtb rollback: chapa count'; END IF;

  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  VALUES ('tse', 'chapa', 'chapas_2026.fonte_detalhe:prtb', 'encontrado', 1,
    'Rollback de 20260917000001: chapa do PRTB voltou ao estado de 15/09/2026.',
    'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002554479',
    'rollback:20260917000001', 'escrita');

  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260917000001';
END
$rollback$;
COMMIT;
