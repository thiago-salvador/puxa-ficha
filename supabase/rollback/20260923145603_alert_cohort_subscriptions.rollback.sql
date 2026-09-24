-- Removes the alert cohort subscription schema and its ledger entry.
BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
BEGIN
  SELECT count(*), max(version)
  INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260923145603';
  IF ledger_count <> 1 OR ledger_top <> '20260923145603' THEN
    RAISE EXCEPTION 'rollback requires this migration to be the ledger tip';
  END IF;
  IF to_regclass('public.alert_cohort_subscriptions') IS NULL
     OR to_regprocedure('public.alert_cohort_subscriptions_limit()') IS NULL
     OR to_regprocedure('public.alert_unsubscribe_all(uuid)') IS NULL THEN
    RAISE EXCEPTION 'rollback found an incomplete schema';
  END IF;
END
$precondition$;

DROP FUNCTION public.alert_unsubscribe_all(uuid);
DROP TABLE public.alert_cohort_subscriptions;
DROP FUNCTION public.alert_cohort_subscriptions_limit();
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260923145603';

DO $postcondition$
BEGIN
  IF to_regclass('public.alert_cohort_subscriptions') IS NOT NULL
     OR to_regprocedure('public.alert_cohort_subscriptions_limit()') IS NOT NULL
     OR to_regprocedure('public.alert_unsubscribe_all(uuid)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923145603') THEN
    RAISE EXCEPTION 'rollback did not remove the cohort schema and ledger entry';
  END IF;
END
$postcondition$;

COMMIT;
