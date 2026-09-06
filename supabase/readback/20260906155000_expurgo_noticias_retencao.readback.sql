DO $readback$
DECLARE
  restantes integer;
BEGIN
  SELECT count(*) INTO restantes
  FROM public.noticias_candidato
  WHERE data_publicacao < timestamptz '2025-09-06T15:35:00Z';
  IF restantes<>0 THEN
    RAISE EXCEPTION 'readback retenção de notícias: expiradas restantes=%', restantes;
  END IF;
  RAISE NOTICE 'NOTICIAS_RETENCAO_READBACK_OK expired_remaining=0';
END
$readback$;
