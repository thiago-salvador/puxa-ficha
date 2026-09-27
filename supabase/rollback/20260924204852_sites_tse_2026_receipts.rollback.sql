BEGIN;
DO $rollback$
DECLARE removed integer;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260924204852' AND fonte='sites-tse') <> 513 THEN
    RAISE EXCEPTION 'sites_tse_2026: recibos divergem; rollback manual';
  END IF;
  DELETE FROM public.coleta_log WHERE execucao='migration:20260924204852' AND fonte='sites-tse';
  GET DIAGNOSTICS removed=ROW_COUNT;
  IF removed<>513 THEN RAISE EXCEPTION 'sites_tse_2026: rollback removeu %, esperado 513',removed; END IF;
END
$rollback$;
COMMIT;
