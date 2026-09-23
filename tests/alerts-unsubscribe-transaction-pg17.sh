#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
CONTAINER_ID="$(docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -v "$ROOT:/repo:ro" "$IMAGE")"
trap 'docker stop "$CONTAINER_ID" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER_ID" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
     && docker exec "$CONTAINER_ID" psql -U postgres -h 127.0.0.1 -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() { docker exec -i "$CONTAINER_ID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }
SUBSCRIBER="11111111-1111-4111-8111-111111111111"

q <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
CREATE TABLE public.alert_subscribers (id uuid PRIMARY KEY);
CREATE TABLE public.alert_subscriptions (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES public.alert_subscribers(id),
  candidato_id uuid NOT NULL
);
GRANT DELETE ON public.alert_subscriptions TO service_role;
INSERT INTO public.alert_subscribers VALUES ('11111111-1111-4111-8111-111111111111');
SQL
q -f /repo/supabase/migrations/20260923145603_alert_cohort_subscriptions.sql >/dev/null
q -c "INSERT INTO supabase_migrations.schema_migrations VALUES ('20260923145603')" >/dev/null
q -c 'BEGIN' -f /repo/supabase/readback/20260923145603_alert_cohort_subscriptions.readback.sql -c 'ROLLBACK' >/dev/null

seed() {
  q <<'SQL'
INSERT INTO public.alert_subscriptions VALUES (
  gen_random_uuid(), '11111111-1111-4111-8111-111111111111', gen_random_uuid()
);
INSERT INTO public.alert_cohort_subscriptions(subscriber_id,cargo,uf)
VALUES ('11111111-1111-4111-8111-111111111111','Governador','SP');
SQL
}

assert_counts() {
  local actual
  actual="$(q -c "SELECT (SELECT count(*) FROM public.alert_subscriptions WHERE subscriber_id='$SUBSCRIBER')::text || ':' || (SELECT count(*) FROM public.alert_cohort_subscriptions WHERE subscriber_id='$SUBSCRIBER')::text")"
  [[ "$actual" == "$1" ]] || { echo "unexpected subscription counts: $actual" >&2; exit 1; }
}

seed
q <<'SQL'
CREATE FUNCTION public.reject_alert_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'delete rejected'; END; $$;
CREATE TRIGGER reject_direct BEFORE DELETE ON public.alert_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.reject_alert_delete();
SQL
if q -c "SELECT public.alert_unsubscribe_all('$SUBSCRIBER')" >/dev/null 2>&1; then
  echo 'direct delete failure was accepted' >&2; exit 1
fi
assert_counts '1:1'
q -c 'DROP TRIGGER reject_direct ON public.alert_subscriptions' >/dev/null

q <<'SQL'
CREATE TRIGGER reject_cohort BEFORE DELETE ON public.alert_cohort_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.reject_alert_delete();
SQL
if q -c "SELECT public.alert_unsubscribe_all('$SUBSCRIBER')" >/dev/null 2>&1; then
  echo 'cohort delete failure was accepted' >&2; exit 1
fi
assert_counts '1:1'
q -c 'DROP TRIGGER reject_cohort ON public.alert_cohort_subscriptions' >/dev/null

q -c "SELECT public.alert_unsubscribe_all('$SUBSCRIBER')" >/dev/null
assert_counts '0:0'

seed
q -c 'DROP TABLE public.alert_cohort_subscriptions' >/dev/null
if q -c "SELECT public.alert_unsubscribe_all('$SUBSCRIBER')" >/dev/null 2>&1; then
  echo 'missing cohort table was accepted' >&2; exit 1
fi
[[ "$(q -c "SELECT count(*) FROM public.alert_subscriptions WHERE subscriber_id='$SUBSCRIBER'")" == '1' ]] || {
  echo 'direct subscription was removed despite missing cohort table' >&2; exit 1
}
echo 'PASS: atomic cancellation on direct/cohort failures and missing cohort table'
