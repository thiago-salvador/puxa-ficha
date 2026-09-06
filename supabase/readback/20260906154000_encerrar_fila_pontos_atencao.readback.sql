DO $readback$
DECLARE
  pendentes integer;
  snapshots integer;
BEGIN
  SELECT count(*) INTO pendentes
  FROM public.pontos_atencao
  WHERE id IN (
    '88373c8d-43c9-400d-a896-5f11e3fd3ed7',
    'a48921e3-0988-4125-bb39-4ea2729a57a2'
  )
    AND (visivel IS TRUE OR despublicacao_motivo IS NULL OR despublicado_em IS NULL);
  IF pendentes<>0 THEN
    RAISE EXCEPTION 'readback fila editorial: pendentes=%', pendentes;
  END IF;

  SELECT count(*) INTO snapshots
  FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260906154000' AND tabela='pontos_atencao';
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND snapshots<>2 THEN
    RAISE EXCEPTION 'readback fila editorial: snapshots esperados=2 atuais=%', snapshots;
  END IF;

  RAISE NOTICE 'FILA_PONTOS_ATENCAO_READBACK_OK pending=0 snapshots=%', snapshots;
END
$readback$;
