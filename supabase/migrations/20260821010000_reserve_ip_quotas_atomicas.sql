BEGIN;

-- Reserva de cota e gravação na mesma transação.
--
-- As três superfícies públicas (short-link, analytics/event, alerts/subscribe)
-- faziam COUNT e depois INSERT/UPDATE em round-trips separados. Em paralelo,
-- todas as requisições liam o mesmo número e todas gravavam: o teto só valia
-- para pedido sequencial. pg_advisory_xact_lock serializa a chave (namespace +
-- ip_hash); o COUNT vê as gravações já commitadas desta transação; o INSERT
-- ou o carimbo acontecem antes do COMMIT. INSERT … WHERE COUNT no READ
-- COMMITTED não fecha este furo.
--
-- EXECUTE só para service_role: o anon key não pode POST /rest/v1/rpc e pular
-- o limiter do Next. SECURITY INVOKER: o Next já chama com service_role.

CREATE OR REPLACE FUNCTION public.insert_quiz_short_link_under_ip_quota(
  p_token text,
  p_query_string text,
  p_ip_hash text,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_since timestamptz,
  p_max integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'insert_quiz_short_link_under_ip_quota: p_max must be >= 1';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('quiz-short-link:' || coalesce(p_ip_hash, '')));

  SELECT COUNT(*)::integer INTO v_count
  FROM public.quiz_result_short_links
  WHERE ip_hash = p_ip_hash
    AND created_at >= p_since;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object('status', 'quota_exceeded');
  END IF;

  BEGIN
    -- @write tabela=quiz_result_short_links ref=quota-atomica campos=token,query_string,ip_hash,created_at,expires_at
    INSERT INTO public.quiz_result_short_links (
      token, query_string, ip_hash, created_at, expires_at
    )
    SELECT p_token, p_query_string, p_ip_hash, p_created_at, p_expires_at
    WHERE 'quota-atomica' IS NOT NULL;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'duplicate');
  END;

  RETURN jsonb_build_object('status', 'inserted');
END;
$$;

REVOKE ALL ON FUNCTION public.insert_quiz_short_link_under_ip_quota(text, text, text, timestamptz, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_quiz_short_link_under_ip_quota(text, text, text, timestamptz, timestamptz, timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_quiz_short_link_under_ip_quota(text, text, text, timestamptz, timestamptz, timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.insert_quiz_short_link_under_ip_quota(text, text, text, timestamptz, timestamptz, timestamptz, integer) IS
  'Reserva a cota horária por ip_hash e grava o token na mesma transação. Sem EXECUTE para anon/authenticated.';

CREATE OR REPLACE FUNCTION public.insert_analytics_launch_event_under_ip_quota(
  p_event_name text,
  p_payload jsonb,
  p_proof_id text,
  p_ip_hash text,
  p_since timestamptz,
  p_max integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'insert_analytics_launch_event_under_ip_quota: p_max must be >= 1';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('analytics-event:' || coalesce(p_ip_hash, '')));

  SELECT COUNT(*)::integer INTO v_count
  FROM public.analytics_launch_events
  WHERE ip_hash = p_ip_hash
    AND created_at >= p_since;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object('status', 'quota_exceeded');
  END IF;

  -- @write tabela=analytics_launch_events ref=quota-atomica campos=event_name,payload,proof_id,ip_hash
  INSERT INTO public.analytics_launch_events (
    event_name, payload, proof_id, ip_hash
  )
  SELECT p_event_name, coalesce(p_payload, '{}'::jsonb), p_proof_id, p_ip_hash
  WHERE 'quota-atomica' IS NOT NULL;

  RETURN jsonb_build_object('status', 'inserted');
END;
$$;

REVOKE ALL ON FUNCTION public.insert_analytics_launch_event_under_ip_quota(text, jsonb, text, text, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_analytics_launch_event_under_ip_quota(text, jsonb, text, text, timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_analytics_launch_event_under_ip_quota(text, jsonb, text, text, timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.insert_analytics_launch_event_under_ip_quota(text, jsonb, text, text, timestamptz, integer) IS
  'Reserva a cota por ip_hash na janela e grava o evento na mesma transação. Sem EXECUTE para anon/authenticated.';

CREATE OR REPLACE FUNCTION public.insert_alert_subscriber_under_ip_quota(
  p_email text,
  p_email_hash text,
  p_nome text,
  p_verify_token_hash text,
  p_verify_token_expires_at timestamptz,
  p_manage_token_hash text,
  p_manage_token_ciphertext text,
  p_ip_consentimento_hash text,
  p_since timestamptz,
  p_max integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  IF p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'insert_alert_subscriber_under_ip_quota: p_max must be >= 1';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('alerts-new-subscriber:' || coalesce(p_ip_consentimento_hash, '')));

  SELECT COUNT(*)::integer INTO v_count
  FROM public.alert_subscribers
  WHERE ip_consentimento_hash = p_ip_consentimento_hash
    AND created_at >= p_since;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object('status', 'quota_exceeded');
  END IF;

  BEGIN
    -- @write tabela=alert_subscribers ref=quota-atomica campos=email,email_hash,nome,verify_token_hash,verify_token_expires_at,manage_token_hash,manage_token_ciphertext,ip_consentimento_hash
    INSERT INTO public.alert_subscribers (
      email,
      email_hash,
      nome,
      verify_token_hash,
      verify_token_expires_at,
      manage_token_hash,
      manage_token_ciphertext,
      ip_consentimento_hash
    )
    SELECT
      p_email,
      p_email_hash,
      p_nome,
      p_verify_token_hash,
      p_verify_token_expires_at,
      p_manage_token_hash,
      p_manage_token_ciphertext,
      p_ip_consentimento_hash
    WHERE 'quota-atomica' IS NOT NULL
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'duplicate');
  END;

  RETURN jsonb_build_object('status', 'inserted', 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.insert_alert_subscriber_under_ip_quota(text, text, text, text, timestamptz, text, text, text, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_alert_subscriber_under_ip_quota(text, text, text, text, timestamptz, text, text, text, timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_alert_subscriber_under_ip_quota(text, text, text, text, timestamptz, text, text, text, timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.insert_alert_subscriber_under_ip_quota(text, text, text, text, timestamptz, text, text, text, timestamptz, integer) IS
  'Reserva a cota de assinantes novos por IP e grava o assinante na mesma transação. Sem EXECUTE para anon/authenticated.';

CREATE OR REPLACE FUNCTION public.reserve_alert_email_ip_budget(
  p_subscriber_id uuid,
  p_email_ip_hash text,
  p_since timestamptz,
  p_max integer,
  p_sent_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'reserve_alert_email_ip_budget: p_max must be >= 1';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('alerts-email:' || coalesce(p_email_ip_hash, '')));

  SELECT COUNT(*)::integer INTO v_count
  FROM public.alert_subscribers
  WHERE last_email_request_ip_hash = p_email_ip_hash
    AND last_verification_email_sent_at >= p_since;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object('status', 'quota_exceeded');
  END IF;

  -- @write tabela=alert_subscribers ref=quota-atomica campos=last_email_request_ip_hash,last_verification_email_sent_at
  UPDATE public.alert_subscribers
  SET
    last_email_request_ip_hash = p_email_ip_hash,
    last_verification_email_sent_at = p_sent_at
  WHERE id = p_subscriber_id
    AND 'quota-atomica' IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  RETURN jsonb_build_object('status', 'reserved');
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_alert_email_ip_budget(uuid, text, timestamptz, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_alert_email_ip_budget(uuid, text, timestamptz, integer, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_alert_email_ip_budget(uuid, text, timestamptz, integer, timestamptz) TO service_role;

COMMENT ON FUNCTION public.reserve_alert_email_ip_budget(uuid, text, timestamptz, integer, timestamptz) IS
  'Reserva a cota de e-mail por IP carimbando o assinante antes do envio. Sem EXECUTE para anon/authenticated.';

COMMIT;
