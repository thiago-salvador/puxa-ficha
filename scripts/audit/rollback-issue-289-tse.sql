-- Reverte somente os dois registros, se ainda coincidirem com a postimage.
-- Não apagar snapshots nem recibos históricos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE n integer;
BEGIN
  UPDATE public.candidatos c SET
    sq_candidato_2026=s.preimage->>'sq_candidato_2026',
    verificacao_campos=s.preimage->'verificacao_campos',
    ultima_atualizacao=(s.preimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='freshness-issue-289-tse-20260909'
    AND s.tabela='candidatos' AND s.row_id=c.id AND to_jsonb(c)=s.postimage;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'rollback289: candidato mudou, recusa reversão'; END IF;
  UPDATE public.chapas_2026 ch SET vice_nome_urna=s.preimage->>'vice_nome_urna'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='freshness-issue-289-tse-20260909'
    AND s.tabela='chapas_2026' AND s.row_id=ch.id AND to_jsonb(ch)=s.postimage;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'rollback289: chapa mudou, recusa reversão'; END IF;
END $rollback$;
COMMIT;
