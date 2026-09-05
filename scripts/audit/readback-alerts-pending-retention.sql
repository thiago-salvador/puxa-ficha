-- MR-06: no PII, no deletes. Run before and after separately approved purge.
-- Existing policy: never verified, verification token expired more than 7 days.
BEGIN READ ONLY;
SELECT count(*) FILTER (WHERE NOT verified AND verify_token_expires_at < now() - interval '7 days') AS expired_pending,
  min(verify_token_expires_at) FILTER (WHERE NOT verified AND verify_token_expires_at < now() - interval '7 days') AS oldest_expired_token,
  count(*) FILTER (WHERE verified) AS verified_preserve,
  count(*) FILTER (WHERE NOT verified AND verify_token_expires_at >= now() - interval '7 days') AS within_grace_preserve
FROM public.alert_subscribers;
ROLLBACK;
