import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const root = process.cwd()
const runner = readFileSync(join(root, "scripts/audit/apply-chapas-2026-biografias.sh"), "utf8")
const workflow = readFileSync(join(root, ".github/workflows/apply-chapas-2026-biografias.yml"), "utf8")

test("runner follow-up aceita somente a versão 20260813111700", () => {
  assert.match(runner, /version=20260813111700/)
  assert.match(runner, /20260813040200\|0/)
  assert.doesNotMatch(runner, /versions=\(/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /print\('BEGIN;'\)/)
  assert.match(runner, /print\('COMMIT;'\)/)
  assert.match(runner, /print\(r\.decode/)
  assert.match(runner, /INSERT INTO supabase_migrations\.schema_migrations/)
  assert.match(runner, /github-actions:/)
  assert.match(runner, /sha256:/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.match(runner, /\$\{GITHUB_REF:\?GITHUB_REF e obrigatoria\}/)
})

test("workflow restringe segredo ao step de aplicação", () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/)
  assert.match(workflow, /test "\$\{\{ github\.ref \}\}" = "refs\/heads\/main"/)
  assert.match(workflow, /git ls-remote/)
  assert.doesNotMatch(workflow.split("steps:")[0], /SUPABASE_DB_URL/)
  const occurrences = workflow.match(/SUPABASE_DB_URL/g) ?? []
  assert.equal(occurrences.length, 1)
  assert.match(workflow, /node-version: 24/)
  assert.match(workflow, /bash scripts\/audit\/apply-chapas-2026-biografias\.sh/)
})

test("runner falha antes de conectar sem contexto explícito", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [join(root, "scripts/audit/apply-chapas-2026-biografias.sh")], { cwd: root, env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /PF_DATABASE_URL e obrigatoria/)
})
