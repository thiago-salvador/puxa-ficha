import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

const runnerPath = "scripts/audit/apply-verified-candidate-updates-production.sh"
const runner = readFileSync(runnerPath, "utf8")
const workflow = readFileSync(".github/workflows/apply-verified-candidate-updates-production.yml", "utf8")

test("H12 production apply fixes the migration, predecessor, project and transactional ledger", () => {
  for (const value of ["version=20260908160000", "previous_version=20260907193100", "previous_digest=sha256:dc4d5c4aa894cb02cddd11e86bee38e430ed7335275208287426e2ed4e476d82", "wskpzsobvqwhnbsdsmok", "pg_advisory_xact_lock", "INSERT INTO supabase_migrations.schema_migrations", "PGSSLMODE=verify-full", "git ls-remote", "checkout sujo", "BEGIN/COMMIT externos unicos"]) {
    assert.ok(runner.includes(value), value)
  }
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.match(runner, /verified_candidate_updates\.rollback\.sql/)
  assert.match(runner, /verified_candidate_updates\.readback\.sql/)
})

test("H12 workflow restricts dispatch to production main SHA and proves PostgreSQL behavior first", () => {
  for (const value of ["workflow_dispatch:", "environment: production", "production-db-migrations", 'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"', "persist-credentials: false", "if: github.ref == 'refs/heads/main'"]) {
    assert.ok(workflow.includes(value), value)
  }
  assert.ok(workflow.indexOf("provar-verified-candidate-updates-pg17.sh") < workflow.indexOf("apply-verified-candidate-updates-production.sh"))
  assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
})

test("H12 runner refuses to connect without explicit deployment context", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PF_DATABASE_URL e obrigatoria/)
})
