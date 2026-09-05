import assert from "node:assert/strict"
import { execFile, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { promisify } from "node:util"
import test from "node:test"

// Isolated PostgreSQL fixture, no published port, credentials or remote writes.
test("PG17 request quota: concurrent clients, namespace isolation, expiry and private grants", {
  skip: process.env.PF_PROVAR_QUOTA_PG17 !== "1", timeout: 120_000,
}, async () => {
  const run = (args: string[], input?: string) => spawnSync("docker", args, { input, encoding: "utf8", timeout: 60_000 })
  const started = run(["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"])
  assert.equal(started.status, 0, started.stderr)
  const container = started.stdout.trim()
  const q = (sql: string) => run(["exec", "-i", container, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], sql)
  const ok = (sql: string) => { const r = q(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
  const file = (path: string) => readFileSync(path, "utf8")
  try {
    const ready = run(["exec", container, "bash", "-c", "for i in {1..40}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"])
    assert.equal(ready.status, 0, ready.stderr)
    ok("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;")
    ok(file("supabase/migrations/20260905220100_request_ip_quota.sql"))
    const key = "a".repeat(48)
    const execute = promisify(execFile)
    const results = await Promise.all(Array.from({ length: 20 }, async () => {
      const { stdout } = await execute("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", `SET ROLE service_role; SELECT reserve_request_ip_quota('${key}',5,60000);`])
      return JSON.parse(stdout.trim()) as { allowed: boolean; remaining: number }
    }))
    assert.equal(results.filter(x => x.allowed).length, 5)
    assert.equal(results.filter(x => !x.allowed).length, 15)
    assert.ok(results.every(x => x.remaining >= 0 && x.remaining <= 4))
    assert.equal(JSON.parse(ok(`SELECT reserve_request_ip_quota('${"b".repeat(48)}',5,60000)`)).allowed, true)
    for (const role of ["anon", "authenticated"]) {
      const denied = q(`SET ROLE ${role}; SELECT reserve_request_ip_quota('${key}',5,60000);`)
      assert.notEqual(denied.status, 0)
      assert.match(denied.stderr, /permission denied/)
      assert.notEqual(q(`SET ROLE ${role}; SELECT * FROM request_ip_quotas`).status, 0)
    }
    ok(`UPDATE request_ip_quotas SET reset_at=now()-interval '1 second' WHERE bucket_key='${key}'`)
    const renewed = JSON.parse(ok(`SELECT reserve_request_ip_quota('${key}',5,60000)`))
    assert.equal(renewed.allowed, true)
    assert.equal(renewed.remaining, 4)
    assert.notEqual(q("SELECT reserve_request_ip_quota('raw-ip',1,1000)").status, 0)
    ok(file("scripts/audit/readback-request-ip-quota.sql"))
    ok("GRANT EXECUTE ON FUNCTION reserve_request_ip_quota(text,integer,integer) TO anon")
    assert.notEqual(q(file("scripts/audit/readback-request-ip-quota.sql")).status, 0, "readback rejects public privilege drift")
    ok("REVOKE EXECUTE ON FUNCTION reserve_request_ip_quota(text,integer,integer) FROM anon")
    ok("ALTER TABLE request_ip_quotas DISABLE ROW LEVEL SECURITY")
    assert.notEqual(q(file("scripts/audit/readback-request-ip-quota.sql")).status, 0, "readback rejects missing RLS")
    ok("ALTER TABLE request_ip_quotas ENABLE ROW LEVEL SECURITY")
    ok(file("scripts/audit/readback-request-ip-quota.sql"))
    ok(file("scripts/audit/rollback-request-ip-quota.sql"))
    assert.equal(ok("SELECT to_regclass('public.request_ip_quotas') IS NULL"), "t")
    assert.equal(ok("SELECT to_regprocedure('public.reserve_request_ip_quota(text,integer,integer)') IS NULL"), "t")
  } finally {
    const stopped = run(["stop", container])
    assert.equal(stopped.status, 0, stopped.stderr)
  }
})
