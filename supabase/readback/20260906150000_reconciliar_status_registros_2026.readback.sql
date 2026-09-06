DO $readback$
DECLARE
  incorretos integer;
  snapshots integer;
BEGIN
  SELECT count(*) INTO incorretos
  FROM public.candidatos
  WHERE publicavel IS TRUE
    AND sq_candidato_2026 IS NOT NULL
    AND status<>'candidato';
  IF incorretos<>0 THEN
    RAISE EXCEPTION 'readback status 2026: registros públicos incorretos=%', incorretos;
  END IF;

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug='clebio-genuino' AND status='removido' AND publicavel IS FALSE
      AND situacao_candidatura='indeferido'
  ) THEN
    RAISE EXCEPTION 'readback status 2026: clebio-genuino não foi despublicado';
  END IF;

  SELECT count(*) INTO snapshots
  FROM public.identidade_timeline_quarentena_snapshot
  WHERE migration_version='20260906150000' AND tabela='candidatos';
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND snapshots<>165 THEN
    RAISE EXCEPTION 'readback status 2026: snapshots esperados=165 atuais=%', snapshots;
  END IF;

  RAISE NOTICE 'STATUS_REGISTROS_2026_READBACK_OK public_status_mismatch=0 clebio_public=false snapshots=%', snapshots;
END
$readback$;
