-- MR-13: diagnostic only. A 90-day bucket is a measurement, not a deletion policy.
-- Do not remove provenance rows before an archive destination, restore proof,
-- retention window and exact destructive action have been approved.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT 'candidate_changes' AS ledger, count(*) AS rows_total,
  count(*) FILTER (WHERE created_at < now() - interval '90 days') AS rows_older_90_days,
  min(created_at) AS oldest_entry, max(created_at) AS latest_entry,
  pg_total_relation_size('public.candidate_changes') AS relation_bytes
FROM public.candidate_changes
UNION ALL
SELECT 'coleta_log', count(*),
  count(*) FILTER (WHERE executado_em < now() - interval '90 days'),
  min(executado_em), max(executado_em), pg_total_relation_size('public.coleta_log')
FROM public.coleta_log;
ROLLBACK;
