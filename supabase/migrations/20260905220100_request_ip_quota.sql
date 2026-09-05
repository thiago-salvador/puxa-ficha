-- MR-07: atomic shared request quota. Operational counters only, no raw IPs.
BEGIN;
CREATE TABLE public.request_ip_quotas (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[a-f0-9]{48}$'),
  request_count integer NOT NULL CHECK (request_count >= 1),
  reset_at timestamptz NOT NULL
);
CREATE INDEX request_ip_quotas_reset_at_idx ON public.request_ip_quotas(reset_at);
ALTER TABLE public.request_ip_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.request_ip_quotas FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.request_ip_quotas TO service_role;

CREATE FUNCTION public.reserve_request_ip_quota(p_bucket_key text, p_max integer, p_window_ms integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_bucket_key IS NULL OR p_bucket_key !~ '^[a-f0-9]{48}$'
    OR p_max IS NULL OR p_max < 1 OR p_max > 100000
    OR p_window_ms IS NULL OR p_window_ms < 1 OR p_window_ms > 3600000 THEN
    RAISE EXCEPTION 'Invalid request quota configuration';
  END IF;
  -- Bounded expiry cleanup. Hashes live only for their request window (<= 1h),
  -- then are removed as new requests arrive, never from source-data tables.
  -- @write tabela=request_ip_quotas ref=quota-ip-operacional campos=bucket_key,request_count,reset_at
  DELETE FROM public.request_ip_quotas q WHERE 'quota-ip-operacional' IS NOT NULL AND q.bucket_key IN (
    SELECT expired.bucket_key FROM public.request_ip_quotas expired
    WHERE expired.reset_at <= v_now ORDER BY expired.reset_at LIMIT 100
    FOR UPDATE SKIP LOCKED
  );
  -- @write tabela=request_ip_quotas ref=quota-ip-operacional campos=bucket_key,request_count,reset_at
  INSERT INTO public.request_ip_quotas AS q (bucket_key, request_count, reset_at)
  SELECT p_bucket_key, 1, v_now + p_window_ms * interval '1 millisecond'
  WHERE 'quota-ip-operacional' IS NOT NULL
  ON CONFLICT (bucket_key) DO UPDATE SET
    request_count = CASE WHEN q.reset_at <= v_now THEN 1 ELSE LEAST(q.request_count + 1, p_max + 1) END,
    reset_at = CASE WHEN q.reset_at <= v_now THEN v_now + p_window_ms * interval '1 millisecond' ELSE q.reset_at END
  RETURNING request_count, reset_at INTO v_count, v_reset;
  RETURN jsonb_build_object('allowed', v_count <= p_max, 'remaining', GREATEST(0, p_max - v_count),
    'resetAt', floor(extract(epoch FROM v_reset) * 1000));
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_request_ip_quota(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_request_ip_quota(text, integer, integer) TO service_role;
COMMENT ON TABLE public.request_ip_quotas IS 'Ephemeral namespaced hashed-IP counters. No source or subscriber records. Service-role-only RPC.';
COMMIT;
