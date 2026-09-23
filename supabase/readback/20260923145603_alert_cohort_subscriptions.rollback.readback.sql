-- Verifies that the alert cohort subscription rollback is complete.
DO $readback$
BEGIN
  IF to_regclass('public.alert_cohort_subscriptions') IS NOT NULL
     OR to_regprocedure('public.alert_cohort_subscriptions_limit()') IS NOT NULL
     OR to_regprocedure('public.alert_unsubscribe_all(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'alert cohort subscription objects remain after rollback';
  END IF;
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923145603'
  ) THEN
    RAISE EXCEPTION 'alert cohort migration remains in ledger after rollback';
  END IF;
END
$readback$;
