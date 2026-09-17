import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const version = "20260916120000"
const runnerPath = "scripts/audit/apply-verified-candidate-updates-security-invoker-production.sh"
const runner = readFileSync(runnerPath, "utf8")
const workflow = readFileSync(".github/workflows/apply-verified-candidate-updates-security-invoker-production.yml", "utf8")
const migration = readFileSync(`supabase/migrations/${version}_verified_candidate_updates_security_invoker.sql`, "utf8")
const rollback = readFileSync(`supabase/rollback/${version}_verified_candidate_updates_security_invoker.rollback.sql`, "utf8")
const readback = readFileSync(`supabase/readback/${version}_verified_candidate_updates_security_invoker.readback.sql`, "utf8")
const pgProof = readFileSync("tests/verified-candidate-updates-security-invoker.pg.sql", "utf8")
const sha256 = (path: string) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`

test("security invoker apply pins the migration, the current ledger top and the production project", () => {
  const predecessor = "supabase/migrations/20260915220000_patrimonio_contexto_eleitoral.sql"
  for (const value of [
    `version=${version}`,
    "previous_version=20260915220000",
    `previous_digest=${sha256(predecessor)}`,
    "wskpzsobvqwhnbsdsmok",
    "pg_advisory_xact_lock",
    "INSERT INTO supabase_migrations.schema_migrations",
    "PGSSLMODE=verify-full",
    "git ls-remote",
    "checkout sujo",
    "BEGIN/COMMIT externos unicos",
  ]) {
    assert.ok(runner.includes(value), value)
  }
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.match(runner, /verified_candidate_updates_security_invoker\.rollback\.sql/)
  assert.match(runner, /verified_candidate_updates_security_invoker\.readback\.sql/)
})

test("security invoker workflow is manual, main-only, and proves PostgreSQL behavior before applying", () => {
  for (const value of [
    "workflow_dispatch:",
    "environment: production",
    "production-db-migrations",
    'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"',
    "persist-credentials: false",
    "if: github.ref == 'refs/heads/main'",
  ]) {
    assert.ok(workflow.includes(value), value)
  }
  assert.ok(
    workflow.indexOf("provar-verified-candidate-updates-security-invoker-pg17.sh") <
      workflow.indexOf("apply-verified-candidate-updates-security-invoker-production.sh"),
  )
  // The secret reaches only the validation and apply steps, never the job env or the local proof.
  assert.equal((workflow.match(/secrets\.SUPABASE_DB_URL/g) ?? []).length, 2)
  const jobEnv = workflow.slice(workflow.indexOf("    env:"), workflow.indexOf("    steps:"))
  assert.doesNotMatch(jobEnv, /SUPABASE_DB_URL/)
})

test("migration replaces the owner-executed view without widening the public surface", () => {
  assert.match(migration, /WITH \(security_barrier = true, security_invoker = true\)/)
  assert.match(migration, /CREATE POLICY verified_candidate_updates_public_read ON public\.verified_candidate_updates\s+FOR SELECT TO anon, authenticated/)
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/)
  assert.match(migration, /despublicado_em IS NOT NULL/)
  const grant = migration.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.verified_candidate_updates TO anon, authenticated;/)
  assert.ok(grant, "column grant")
  assert.deepEqual(grant[1].split(",").map((column) => column.trim()).sort(), [
    "after_value", "before_value", "candidate_id", "detected_at", "field", "id", "source_url", "year",
  ])
  assert.doesNotMatch(migration, /GRANT SELECT ON public\.verified_candidate_updates TO/)
  assert.doesNotMatch(migration, /verified_candidate_observations TO/)
  assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/)
})

test("rollback and readbacks cover the ledger, the options and the private columns", () => {
  assert.match(rollback, /WITH \(security_barrier = true\) AS/)
  assert.match(rollback, /RESET \(security_invoker\)/)
  assert.match(rollback, /DROP FUNCTION public\.is_public_verified_candidate_update\(uuid\)/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version='20260916120000'/)
  for (const column of ["source_identity", "before_source_url"]) assert.ok(readback.includes(`'${column}'`), column)
  assert.match(readback, /view rows diverge from publication gate/)
  for (const scenario of ["sibling_quarantined", "all_quarantined", "candidate_unpublished", "candidate_removed"]) {
    assert.ok(pgProof.includes(`'${scenario}'`), scenario)
  }
  assert.match(pgProof, /naive invoker view to leak/)
})

test("security invoker runner refuses to connect without explicit deployment context", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PF_DATABASE_URL e obrigatoria/)
})
