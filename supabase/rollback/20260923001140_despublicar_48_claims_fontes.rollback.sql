-- Rollback CAS da migration 20260923001140.
-- Reabre somente se os 48 postimages ainda forem exatos e nenhum candidato
-- estiver publicado: restaurar claims com fonte defeituosa em ficha publica
-- seria uma regressao editorial.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.pontos_atencao IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
DECLARE
  snapshot_count integer;
  ids_digest text;
  public_count integer;
  ready_count integer;
  restored_count integer;
  final_count integer;
BEGIN
  SELECT count(*), md5(string_agg(row_id::text, ',' ORDER BY row_id::text))
    INTO snapshot_count, ids_digest
  FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260923001140' AND tabela='pontos_atencao';
  IF snapshot_count <> 48 OR ids_digest IS DISTINCT FROM '096f425b8979b5eb9bc9fd01bca13a71' THEN
    RAISE EXCEPTION 'hide-48 rollback: snapshots=% digest=%', snapshot_count, ids_digest;
  END IF;

  SELECT count(*) INTO public_count
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.candidatos_publico c ON c.id=s.candidato_id
  WHERE s.migration_version='20260923001140' AND s.tabela='pontos_atencao';
  IF public_count <> 0 THEN
    RAISE EXCEPTION 'hide-48 rollback: % candidatos publicados; reavaliar', public_count;
  END IF;

  SELECT count(*) INTO ready_count
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.pontos_atencao p ON p.id=s.row_id
  WHERE s.migration_version='20260923001140'
    AND s.tabela='pontos_atencao'
    AND to_jsonb(p)=s.postimage;
  IF ready_count <> 48 THEN
    RAISE EXCEPTION 'hide-48 rollback: postimage/CAS divergente; prontos=%', ready_count;
  END IF;

  -- @write tabela=pontos_atencao ref=20260923001140-rollback campos=visivel,despublicacao_motivo,despublicado_em
  UPDATE public.pontos_atencao p
  SET visivel=(s.preimage->>'visivel')::boolean,
      despublicacao_motivo=s.preimage->>'despublicacao_motivo',
      despublicado_em=(s.preimage->>'despublicado_em')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260923001140'
    AND s.tabela='pontos_atencao'
    AND s.row_id=p.id
    AND to_jsonb(p)=s.postimage;
  GET DIAGNOSTICS restored_count=ROW_COUNT;
  IF restored_count <> 48 THEN
    RAISE EXCEPTION 'hide-48 rollback: restauradas=%, esperado=48', restored_count;
  END IF;

  SELECT count(*) INTO final_count
  FROM public.identidade_timeline_quarentena_snapshot s
  JOIN public.pontos_atencao p ON p.id=s.row_id
  WHERE s.migration_version='20260923001140'
    AND s.tabela='pontos_atencao'
    AND to_jsonb(p)=s.preimage;
  IF final_count <> 48 THEN
    RAISE EXCEPTION 'hide-48 rollback: preimages restauradas=%', final_count;
  END IF;
END
$rollback$;
COMMIT;
