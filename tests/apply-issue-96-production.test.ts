import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const runnerPath = join(root, "scripts/audit/apply-issue-96-production.sh")
const workflowPath = join(root, ".github/workflows/apply-issue-96-production.yml")
const readbackPath = join(
  root,
  "supabase/readback/20260825123000_fix_public_attention_sources_issue_96.readback.sql",
)
const rollbackPath = join(
  root,
  "supabase/rollback/20260825123000_fix_public_attention_sources_issue_96.rollback.sql",
)

test("runner aplica somente a migration 20260825123000 com ledger exato", () => {
  const runner = readFileSync(runnerPath, "utf8")
  assert.match(runner, /version=20260825123000/)
  assert.match(runner, /previous_version=20260823160000/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /INSERT INTO supabase_migrations\.schema_migrations/)
  assert.match(runner, /idempotency_key/)
  assert.match(runner, /sha256:/)
  assert.match(runner, /supabase\/readback/)
  assert.match(runner, /supabase\/rollback/)
  assert.match(runner, /migration deve ter exatamente um BEGIN e um COMMIT externos/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
})

test("workflow limita a escrita a main, produção e um SHA fechado", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /production-db-migrations/)
  assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  assert.match(workflow, /bash scripts\/audit\/apply-issue-96-production\.sh/)
  assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  assert.doesNotMatch(workflow, /inputs:\s*[\s\S]*migration:/)
})

test("readback exige 15 marcadores, 10 correções e 5 despublicações", () => {
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /marked_count <> 15/)
  assert.match(readback, /corrected_count <> 10/)
  assert.match(readback, /hidden_count <> 5/)
  assert.match(readback, /fonte corrigida/)
  assert.match(readback, /despublicado/)
})

test("rollback usa a preimagem auditável e remove somente o marcador da issue", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /titulo_anterior/)
  assert.match(rollback, /descricao_anterior/)
  assert.match(rollback, /fontes_anteriores/)
  assert.match(rollback, /visivel_anterior/)
  assert.match(rollback, /dados_relacionados = p\.dados_relacionados - 'issue_96_link_check_2026_08_25'/)
  assert.match(rollback, /restored_count <> 15/)
})

test("runner falha antes de conectar sem contexto explícito", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { cwd: root, env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /PF_DATABASE_URL e obrigatoria/)
})
