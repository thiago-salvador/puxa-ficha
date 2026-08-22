#!/usr/bin/env bash
# Prova as quatro RPCs de quota em PostgreSQL 17 real e descartável.
#
# O teste estático congela o SQL esperado. Este harness é quem prova a
# atomicidade runtime: retém a primeira escrita dentro da função, confirma em
# pg_locks que as outras sete sessões disputam o advisory lock e então exige
# exatamente três sucessos e cinco quota_exceeded.
#
# Não usa segredo, Supabase remoto, porta publicada ou dependência npm.
set -euo pipefail
cd "$(dirname "$0")/../.."

IMG="postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"
MIGRATION="supabase/migrations/20260821010000_reserve_ip_quotas_atomicas.sql"
C="pf-quota-rpc-$$"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/pf-quota-rpc.XXXXXX")"
BACKGROUND_PIDS=()

cleanup() {
  for pid in ${BACKGROUND_PIDS[@]+"${BACKGROUND_PIDS[@]}"}; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  docker rm -f "$C" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

[[ -f "$MIGRATION" ]] || { echo "FAIL: migration ausente: $MIGRATION"; exit 1; }
docker info >/dev/null 2>&1 || { echo "FAIL: Docker indisponivel"; exit 1; }
docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMG" >/dev/null || {
  echo "FAIL: Docker nao subiu o PostgreSQL 17"; exit 1;
}

ready=0
for _ in $(seq 1 90); do
  if docker exec "$C" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo "FAIL: PostgreSQL 17 nao ficou pronto"; exit 1; }

q() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

q <<'SQL' >/dev/null
create extension if not exists pgcrypto;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table public.quiz_result_short_links (
  token text primary key,
  query_string text not null,
  ip_hash text,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table public.analytics_launch_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  proof_id text,
  ip_hash text,
  created_at timestamptz not null default clock_timestamp()
);

create table public.alert_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  email_hash text unique,
  nome text,
  verify_token_hash text,
  verify_token_expires_at timestamptz,
  manage_token_hash text,
  manage_token_ciphertext text,
  ip_consentimento_hash text,
  created_at timestamptz not null default clock_timestamp(),
  last_email_request_ip_hash text,
  last_verification_email_sent_at timestamptz
);
SQL

docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < "$MIGRATION"

q <<'SQL' >/dev/null
create or replace function public.pf20_wait_barrier() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(TG_ARGV[0]));
  return new;
end;
$$;

create trigger pf20_quiz_barrier before insert on public.quiz_result_short_links
for each row execute function public.pf20_wait_barrier('pf20-barrier:quiz');
create trigger pf20_analytics_barrier before insert on public.analytics_launch_events
for each row execute function public.pf20_wait_barrier('pf20-barrier:analytics');
create trigger pf20_alert_insert_barrier before insert on public.alert_subscribers
for each row execute function public.pf20_wait_barrier('pf20-barrier:alert-insert');
create trigger pf20_alert_email_barrier before update on public.alert_subscribers
for each row execute function public.pf20_wait_barrier('pf20-barrier:alert-email');

insert into public.alert_subscribers(id, email)
select
  ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  'budget-' || g || '@example.test'
from generate_series(1, 8) as g;
SQL

sql_for() {
  local label="$1" i="$2" uuid
  case "$label" in
    quiz)
      printf "%s" "select public.insert_quiz_short_link_under_ip_quota('token-$i', 'q=$i', 'pf20-quiz', clock_timestamp(), clock_timestamp() + interval '1 day', clock_timestamp() - interval '1 hour', 3)->>'status';"
      ;;
    analytics)
      printf "%s" "select public.insert_analytics_launch_event_under_ip_quota('profile_view', '{}'::jsonb, 'proof-$i', 'pf20-analytics', clock_timestamp() - interval '1 hour', 3)->>'status';"
      ;;
    alert-insert)
      printf "%s" "select public.insert_alert_subscriber_under_ip_quota('new-$i@example.test', 'email-hash-$i', 'Pessoa $i', 'verify-$i', clock_timestamp() + interval '1 hour', 'manage-$i', 'cipher-$i', 'pf20-alert-insert', clock_timestamp() - interval '1 hour', 3)->>'status';"
      ;;
    alert-email)
      uuid="00000000-0000-0000-0000-$(printf '%012d' "$i")"
      printf "%s" "select public.reserve_alert_email_ip_budget('$uuid'::uuid, 'pf20-alert-email', clock_timestamp() - interval '1 hour', 3, clock_timestamp())->>'status';"
      ;;
    *) echo "caso desconhecido: $label" >&2; return 1 ;;
  esac
}

barrier_for() {
  case "$1" in
    quiz) echo "pf20-barrier:quiz" ;;
    analytics) echo "pf20-barrier:analytics" ;;
    alert-insert) echo "pf20-barrier:alert-insert" ;;
    alert-email) echo "pf20-barrier:alert-email" ;;
  esac
}

row_count_for() {
  case "$1" in
    quiz) q -c "select count(*) from public.quiz_result_short_links where ip_hash = 'pf20-quiz'" ;;
    analytics) q -c "select count(*) from public.analytics_launch_events where ip_hash = 'pf20-analytics'" ;;
    alert-insert) q -c "select count(*) from public.alert_subscribers where ip_consentimento_hash = 'pf20-alert-insert'" ;;
    alert-email) q -c "select count(*) from public.alert_subscribers where last_email_request_ip_hash = 'pf20-alert-email'" ;;
  esac
}

run_case() {
  local label="$1" success="$2" barrier fifo holder_pid ready_waiters waiting
  local call_pids=() result successes exceeded rows
  barrier="$(barrier_for "$label")"
  fifo="$TMP/$label.fifo"
  mkfifo "$fifo"

  {
    printf "BEGIN; SELECT pg_advisory_xact_lock(hashtext('%s'));\n" "$barrier"
    cat "$fifo"
  } | docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
      >"$TMP/$label-holder.log" 2>&1 &
  holder_pid=$!
  BACKGROUND_PIDS+=("$holder_pid")

  ready_waiters=0
  for _ in $(seq 1 100); do
    if [[ "$(q -c "select count(*) from pg_locks where locktype = 'advisory' and granted")" -ge 1 ]]; then
      ready_waiters=1
      break
    fi
    sleep 0.05
  done
  [[ "$ready_waiters" == 1 ]] || { echo "FAIL: $label nao armou a barreira"; return 1; }

  for i in $(seq 1 8); do
    docker exec -e "PGAPPNAME=pf20-$label-$i" "$C" \
      psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA -c "$(sql_for "$label" "$i")" \
      >"$TMP/$label-$i.out" 2>"$TMP/$label-$i.err" &
    call_pids+=("$!")
  done

  ready_waiters=0
  for _ in $(seq 1 200); do
    waiting="$(q -c "select count(*) from pg_locks where locktype = 'advisory' and not granted")"
    if [[ "$waiting" -ge 8 ]]; then
      ready_waiters=1
      break
    fi
    sleep 0.05
  done
  [[ "$ready_waiters" == 1 ]] || {
    echo "FAIL: $label nao colocou as 8 sessoes em disputa real (waiting=$waiting)"
    return 1
  }

  printf 'COMMIT;\n' > "$fifo"
  wait "$holder_pid"
  for pid in "${call_pids[@]}"; do wait "$pid"; done

  result="$(cat "$TMP/$label-"*.out)"
  successes="$(grep -c "^${success}$" <<<"$result" || true)"
  exceeded="$(grep -c '^quota_exceeded$' <<<"$result" || true)"
  rows="$(row_count_for "$label")"
  if [[ "$successes" != 3 || "$exceeded" != 5 || "$rows" != 3 ]]; then
    echo "FAIL: $label success=$successes quota_exceeded=$exceeded rows=$rows"
    return 1
  fi
  echo "  PASS  $label: 8 sessoes em pg_locks, 3 $success, 5 quota_exceeded, 3 escritas"
}

run_case quiz inserted
run_case analytics inserted
run_case alert-insert inserted
run_case alert-email reserved

echo "PASS: quatro RPCs provaram disputa atomica real em PostgreSQL 17 descartavel"
