-- Verifies the alert cohort subscription schema and privileges.
-- Runs inside the apply transaction and independently in read-only mode.
DO $readback$
DECLARE
  table_oid oid;
  function_oid oid;
  unsubscribe_function_oid oid;
  trigger_count integer;
  constraint_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923145603'
  ) THEN
    RAISE EXCEPTION 'alert cohort subscriptions migration is absent from ledger';
  END IF;

  table_oid := to_regclass('public.alert_cohort_subscriptions');
  IF table_oid IS NULL THEN
    RAISE EXCEPTION 'alert cohort subscriptions table is absent';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = table_oid) THEN
    RAISE EXCEPTION 'alert cohort subscriptions table does not enforce RLS';
  END IF;

  IF has_table_privilege('anon', table_oid, 'SELECT')
     OR has_table_privilege('anon', table_oid, 'INSERT')
     OR has_table_privilege('anon', table_oid, 'UPDATE')
     OR has_table_privilege('anon', table_oid, 'DELETE')
     OR has_table_privilege('authenticated', table_oid, 'SELECT')
     OR has_table_privilege('authenticated', table_oid, 'INSERT')
     OR has_table_privilege('authenticated', table_oid, 'UPDATE')
     OR has_table_privilege('authenticated', table_oid, 'DELETE') THEN
    RAISE EXCEPTION 'client roles have access to alert cohort subscriptions';
  END IF;
  IF NOT has_table_privilege('service_role', table_oid, 'SELECT')
     OR NOT has_table_privilege('service_role', table_oid, 'INSERT')
     OR NOT has_table_privilege('service_role', table_oid, 'DELETE')
     OR has_table_privilege('service_role', table_oid, 'UPDATE') THEN
    RAISE EXCEPTION 'service_role privileges differ from the migration contract';
  END IF;

  SELECT count(*) INTO constraint_count
  FROM pg_constraint
  WHERE conrelid = table_oid
    AND convalidated
    AND conname IN ('alert_cohort_presidente_sem_uf', 'alert_cohort_subscriptions_unique_scope');
  IF constraint_count <> 2 THEN
    RAISE EXCEPTION 'cohort scope constraints are absent or unvalidated';
  END IF;

  function_oid := to_regprocedure('public.alert_cohort_subscriptions_limit()');
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'cohort limit trigger function is absent';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = function_oid)
     OR NOT (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = function_oid) THEN
    RAISE EXCEPTION 'cohort limit trigger function security settings differ';
  END IF;
  IF has_function_privilege('anon', function_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles can execute the cohort limit function';
  END IF;

  unsubscribe_function_oid := to_regprocedure('public.alert_unsubscribe_all(uuid)');
  IF unsubscribe_function_oid IS NULL THEN
    RAISE EXCEPTION 'unsubscribe function is absent';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = unsubscribe_function_oid)
     OR NOT (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = unsubscribe_function_oid) THEN
    RAISE EXCEPTION 'unsubscribe function security settings differ';
  END IF;
  IF NOT has_function_privilege('service_role', unsubscribe_function_oid, 'EXECUTE')
     OR has_function_privilege('anon', unsubscribe_function_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', unsubscribe_function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'unsubscribe function grants differ from the migration contract';
  END IF;

  SELECT count(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgrelid = table_oid
    AND tgname = 'alert_cohort_subscriptions_limit_before_insert'
    AND NOT tgisinternal
    AND tgenabled = 'O';
  IF trigger_count <> 1 THEN
    RAISE EXCEPTION 'cohort limit trigger is absent or disabled';
  END IF;
END
$readback$;
