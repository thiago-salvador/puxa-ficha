BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
DECLARE
  quantidade integer;
BEGIN
  UPDATE public.candidatos c
  SET status=s.preimage->>'status',
      publicavel=(s.preimage->>'publicavel')::boolean,
      situacao_candidatura=s.preimage->>'situacao_candidatura',
      fonte_dados=ARRAY(SELECT jsonb_array_elements_text(s.preimage->'fonte_dados')),
      verificacao_campos=s.preimage->'verificacao_campos',
      ultima_atualizacao=(s.preimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='freshness-dr-helton-20260906'
    AND s.tabela='candidatos'
    AND s.row_id=c.id
    AND to_jsonb(c)=s.postimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF quantidade<>1 THEN
    RAISE EXCEPTION 'dr-helton rollback: escrita esperada=1 atual=%', quantidade;
  END IF;

  DELETE FROM public.coleta_log
  WHERE execucao='migration:freshness-dr-helton-20260906'
    AND candidato_id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid;

  IF (SELECT md5(to_jsonb(c)::text)
      FROM public.candidatos c
      WHERE c.id='86ffacf8-e5d4-4f9b-a808-0f0cb551d832'::uuid)
     IS DISTINCT FROM '4eeab8e203cd80f15fac1b110489a3b8' THEN
    RAISE EXCEPTION 'dr-helton rollback: preimage não foi restaurada';
  END IF;
END
$rollback$;

COMMIT;
