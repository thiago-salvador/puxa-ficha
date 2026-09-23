-- Readback independente da migration 20260923001140.
-- 48 IDs esperados: MD5 dos UUIDs ordenados = 096f425b8979b5eb9bc9fd01bca13a71.
DO $readback$
DECLARE
  snapshot_count integer;
  ids_digest text;
  matching_count integer;
BEGIN
  SELECT count(*), md5(string_agg(row_id::text, ',' ORDER BY row_id::text))
    INTO snapshot_count, ids_digest
  FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260923001140' AND tabela='pontos_atencao';
  IF snapshot_count <> 48 OR ids_digest IS DISTINCT FROM '096f425b8979b5eb9bc9fd01bca13a71' THEN
    RAISE EXCEPTION 'hide-48 readback: snapshots=% digest=%', snapshot_count, ids_digest;
  END IF;

  SELECT count(*) INTO matching_count
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.pontos_atencao p ON p.id=s.row_id
  WHERE s.migration_version='20260923001140'
    AND s.tabela='pontos_atencao'
    AND to_jsonb(p)=s.postimage
    AND p.visivel IS FALSE
    AND p.despublicado_em IS NOT NULL
    AND p.despublicacao_motivo IS NOT NULL;
  IF matching_count <> 48 THEN
    RAISE EXCEPTION 'hide-48 readback: linhas ocultas exatas=%', matching_count;
  END IF;
END
$readback$;
