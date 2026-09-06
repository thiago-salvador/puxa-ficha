BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.pontos_atencao IN SHARE ROW EXCLUSIVE MODE;

DO $rollback$
DECLARE
  quantidade integer;
BEGIN
  UPDATE public.pontos_atencao pa
  SET visivel=(s.preimage->>'visivel')::boolean,
      despublicacao_motivo=s.preimage->>'despublicacao_motivo',
      despublicado_em=(s.preimage->>'despublicado_em')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906154000'
    AND s.tabela='pontos_atencao'
    AND s.row_id=pa.id
    AND to_jsonb(pa)=s.postimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF quantidade<>2 THEN
    RAISE EXCEPTION 'rollback fila editorial: restaurações esperadas=2 atuais=%', quantidade;
  END IF;
END
$rollback$;

COMMIT;
