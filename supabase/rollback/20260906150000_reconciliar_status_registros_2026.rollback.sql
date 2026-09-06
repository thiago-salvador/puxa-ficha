BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
DECLARE
  quantidade integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.identidade_timeline_quarentena_snapshot s
    JOIN public.candidatos c ON c.id=s.row_id
    WHERE s.migration_version='20260906150000'
      AND s.tabela='candidatos'
      AND to_jsonb(c)<>s.postimage
  ) THEN
    RAISE EXCEPTION 'rollback status 2026: estado atual divergiu da postimage';
  END IF;

  UPDATE public.candidatos c
  SET status=s.preimage->>'status',
      publicavel=(s.preimage->>'publicavel')::boolean,
      situacao_candidatura=s.preimage->>'situacao_candidatura',
      ultima_atualizacao=(s.preimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906150000'
    AND s.tabela='candidatos'
    AND s.row_id=c.id
    AND to_jsonb(c)=s.postimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF quantidade<>165 THEN
    RAISE EXCEPTION 'rollback status 2026: restaurações esperadas=165 atuais=%', quantidade;
  END IF;

  DELETE FROM public.coleta_log
  WHERE execucao IN ('migration:20260906150000:status','migration:20260906150000:clebio-genuino');

  DELETE FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260906150000' AND tabela='candidatos';
END
$rollback$;

COMMIT;
