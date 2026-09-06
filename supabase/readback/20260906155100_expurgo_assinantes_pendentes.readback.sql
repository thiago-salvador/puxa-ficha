DO $readback$
DECLARE
  restantes integer;
BEGIN
  SELECT count(*) INTO restantes
  FROM public.alert_subscribers
  WHERE verified IS FALSE
    AND verify_token_expires_at < timestamptz '2026-08-30T15:35:00Z';
  IF restantes<>0 THEN
    RAISE EXCEPTION 'readback retenção de assinantes: pendentes expirados restantes=%', restantes;
  END IF;
  RAISE NOTICE 'ASSINANTES_PENDENTES_RETENCAO_READBACK_OK expired_remaining=0';
END
$readback$;
