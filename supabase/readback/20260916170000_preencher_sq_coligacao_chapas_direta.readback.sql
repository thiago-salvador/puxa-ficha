BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260916170000' AND volume=2 AND resultado='encontrado')<>1 THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta readback: recibo ausente ou invalido';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal' AND sq_coligacao = '280001801455'
         AND titular_sq_candidato = '280002554479' AND vice_sq_candidato = '280002554490')<>1
     OR (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:TO:jose-wilson-siqueira-campos-junior:270002554375' AND sq_coligacao = '270001800814'
         AND titular_sq_candidato = '270002554375' AND vice_sq_candidato = '270002554376')<>1
     OR (SELECT count(*) FROM public.chapas_2026 WHERE sq_coligacao IS NULL)<>0
  THEN
    RAISE EXCEPTION 'sq-coligacao-chapas-direta readback: valor divergiu';
  END IF;
END
$readback$;
COMMIT;
