-- Apaga pedidos de alerta não confirmados cujo token expirou há mais de sete
-- dias. A tabela guarda email em claro; preservar cópia de rollback contrariaria
-- o objetivo do expurgo. `alert_subscriptions` cai por ON DELETE CASCADE.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.alert_subscribers IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  assinatura text;
BEGIN
  SELECT count(*),
         md5(coalesce(string_agg(id::text || '|' || coalesce(verify_token_expires_at::text,''), E'\n' order by id),''))
  INTO quantidade, assinatura
  FROM public.alert_subscribers
  WHERE verified IS FALSE
    AND verify_token_expires_at < timestamptz '2026-08-30T15:35:00Z';

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    IF quantidade<>20 OR assinatura IS DISTINCT FROM 'bc95836853cad4bfebbe8a67a4af63bf' THEN
      RAISE EXCEPTION 'retenção de assinantes: coorte divergiu, linhas=% assinatura=%', quantidade, assinatura;
    END IF;
  END IF;

  -- @write tabela=alert_subscribers ref=retencao-pendentes-20260906 chave=2026-08-30T15:35:00Z campos=delete
  DELETE FROM public.alert_subscribers
  WHERE verified IS FALSE
    AND verify_token_expires_at < timestamptz '2026-08-30T15:35:00Z';

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>20 THEN
    RAISE EXCEPTION 'retenção de assinantes: exclusões esperadas=20 atuais=%', quantidade;
  END IF;
END
$apply$;

COMMIT;
