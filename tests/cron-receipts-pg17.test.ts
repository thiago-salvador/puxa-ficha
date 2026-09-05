import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

test("PG17: recibos privados, upsert limitado e rollback preservador", {
  skip: process.env.PF_PROVAR_CRON_RECEIPTS_PG17 !== "1", timeout: 120_000,
}, () => {
  const run = (args: string[], input?: string) => spawnSync("docker", args, { input, encoding: "utf8", timeout: 90_000 })
  const started = run(["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"])
  assert.equal(started.status, 0, started.stderr)
  const container = started.stdout.trim()
  const query = (sql: string) => run(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql)
  const ok = (sql: string) => { const result = query(sql); assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  const denied = (sql: string) => { const result = query(sql); assert.notEqual(result.status, 0); assert.match(result.stderr, /permission denied/) }
  try {
    const ready = run(["exec", container, "bash", "-c", "for i in {1..60}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"])
    assert.equal(ready.status, 0, ready.stderr)
    ok("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS")
    ok(readFileSync("supabase/migrations/20260905220200_private_cron_execution_receipts.sql", "utf8"))
    assert.equal(ok("SELECT relrowsecurity FROM pg_class WHERE oid='public.cron_execution_receipts'::regclass"), "t")
    for (const role of ["anon", "authenticated"]) {
      denied(`SET ROLE ${role}; SELECT * FROM public.cron_execution_receipts`)
      denied(`SET ROLE ${role}; INSERT INTO public.cron_execution_receipts VALUES ('published-consistency',now())`)
    }
    ok("SET ROLE service_role; INSERT INTO public.cron_execution_receipts VALUES ('published-consistency','2026-09-05T12:00:00Z'); RESET ROLE")
    ok("SET ROLE service_role; INSERT INTO public.cron_execution_receipts VALUES ('published-consistency','2026-09-05T13:00:00Z') ON CONFLICT(name) DO UPDATE SET completed_at=excluded.completed_at; RESET ROLE")
    assert.equal(ok("SELECT count(*) FROM public.cron_execution_receipts"), "1")
    assert.equal(ok("SELECT completed_at='2026-09-05T13:00:00Z' FROM public.cron_execution_receipts"), "t")
    const invalid = query("INSERT INTO public.cron_execution_receipts VALUES ('invented',now())")
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /check constraint/)
    ok(readFileSync("scripts/audit/readback-private-cron-execution-receipts.sql", "utf8"))
    ok("GRANT SELECT ON public.cron_execution_receipts TO anon")
    const drift = query(readFileSync("scripts/audit/readback-private-cron-execution-receipts.sql", "utf8"))
    assert.notEqual(drift.status, 0, "readback deve reprovar grant público, mesmo com RLS")
    assert.match(drift.stderr, /cron_receipts.*grant/)
    ok("REVOKE SELECT ON public.cron_execution_receipts FROM anon")
    ok(readFileSync("scripts/audit/rollback-private-cron-execution-receipts.sql", "utf8"))
    assert.equal(ok("SELECT to_regclass('public.cron_execution_receipts') IS NULL"), "t")
    assert.equal(ok("SELECT count(*) FROM public.cron_execution_receipts_retired_20260905220200"), "1")
    denied("SET ROLE anon; SELECT * FROM public.cron_execution_receipts_retired_20260905220200")
  } finally {
    const stopped = run(["stop", container])
    assert.equal(stopped.status, 0, stopped.stderr)
  }
})
