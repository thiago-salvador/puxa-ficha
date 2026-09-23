BEGIN;

-- Assinaturas por recorte compartilham o ciclo de consentimento e expurgo do
-- assinante existente. A resolução do conjunto ocorre no digest, nunca aqui.
CREATE TABLE public.alert_cohort_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES public.alert_subscribers(id) ON DELETE CASCADE,
  cargo TEXT NOT NULL CHECK (cargo IN ('Presidente', 'Governador', 'Senador')),
  uf TEXT CHECK (uf IN (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT alert_cohort_presidente_sem_uf CHECK (cargo <> 'Presidente' OR uf IS NULL),
  CONSTRAINT alert_cohort_subscriptions_unique_scope
    UNIQUE NULLS NOT DISTINCT (subscriber_id, cargo, uf)
);

CREATE INDEX alert_cohort_subscriptions_subscriber
  ON public.alert_cohort_subscriptions (subscriber_id, created_at DESC);

ALTER TABLE public.alert_cohort_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alert_cohort_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.alert_cohort_subscriptions TO service_role;

-- O lock no assinante serializa inserções concorrentes para o mesmo limite.
-- Nenhuma função pública privilegiada nem policy cliente é criada.
CREATE FUNCTION public.alert_cohort_subscriptions_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  PERFORM 1 FROM public.alert_subscribers WHERE id = NEW.subscriber_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'alert subscriber not found' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.alert_cohort_subscriptions existing
    WHERE existing.subscriber_id = NEW.subscriber_id
      AND existing.cargo = NEW.cargo
      AND existing.uf IS NOT DISTINCT FROM NEW.uf
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO current_count
  FROM public.alert_cohort_subscriptions
  WHERE subscriber_id = NEW.subscriber_id;
  IF current_count >= 10 THEN
    RAISE EXCEPTION 'alert cohort subscription limit reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.alert_cohort_subscriptions_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER alert_cohort_subscriptions_limit_before_insert
  BEFORE INSERT ON public.alert_cohort_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.alert_cohort_subscriptions_limit();

-- Uma chamada RPC executa as duas exclusoes na mesma transacao. Se qualquer
-- tabela faltar ou um DELETE falhar, o Postgres desfaz ambas as exclusoes.
CREATE FUNCTION public.alert_unsubscribe_all(p_subscriber_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.alert_subscriptions WHERE subscriber_id = p_subscriber_id;
  DELETE FROM public.alert_cohort_subscriptions WHERE subscriber_id = p_subscriber_id;
END;
$$;

REVOKE ALL ON FUNCTION public.alert_unsubscribe_all(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alert_unsubscribe_all(UUID) TO service_role;

COMMIT;
