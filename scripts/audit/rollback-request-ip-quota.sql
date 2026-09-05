-- Roll application code back FIRST; new deployed handlers fail closed without RPC.
-- Only ephemeral quota counters are dropped. Requires explicit remote approval.
BEGIN;
DROP FUNCTION public.reserve_request_ip_quota(text, integer, integer);
DROP TABLE public.request_ip_quotas;
COMMIT;
