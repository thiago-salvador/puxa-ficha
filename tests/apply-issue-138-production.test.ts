import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const APPLY = readFileSync(join(ROOT, "scripts/audit/apply-issue-138-production.sh"), "utf8")
const ROLLBACK = readFileSync(join(ROOT, "scripts/audit/rollback-issue-138-production.sh"), "utf8")
const WORKFLOW = readFileSync(join(ROOT, ".github/workflows/apply-issue-138-production.yml"), "utf8")
const ROLLBACK_WORKFLOW = readFileSync(join(ROOT, ".github/workflows/rollback-issue-138-production.yml"), "utf8")
const MANIFEST = JSON.parse(readFileSync(join(ROOT, ".github/merge-queue/irreversible-change-manifest.json"), "utf8"))
const SCHEMA_ROLLBACK = readFileSync(join(ROOT, "supabase/rollback/20260829100000_projetos_lei_chave_por_fonte.rollback.sql"), "utf8")

test("aplicador da issue 138 e fechado, ordenado e registra rollback por versao", () => {
  assert.match(APPLY, /ddl_version=20260829100000/)
  assert.match(APPLY, /backfill_version=20260829100100/)
  assert.match(APPLY, /previous_version=20260829030001/)
  assert.match(APPLY, /wskpzsobvqwhnbsdsmok/)
  assert.match(APPLY, /git ls-remote https:\/\/github\.com\/thiago-salvador\/puxa-ficha\.git refs\/heads\/main/)
  assert.match(APPLY, /pg_advisory_xact_lock\(hashtextextended\('puxa-ficha:issue-138-proposicao-source-key'/)
  assert.match(APPLY, /ddl_rollback=/)
  assert.match(APPLY, /backfill_rollback=/)
  assert.match(APPLY, /ddl_readback=/)
  assert.match(APPLY, /ledger_insert\(ddl_version, ddl_digest, ddl_path, ddl_raw, ddl_rollback\)/)
  assert.match(APPLY, /ledger_insert\(backfill_version, backfill_digest, backfill_path, backfill_raw, backfill_rollback\)/)
  assert.match(APPLY, /idempotency_key/)
  assert.doesNotMatch(APPLY, /supabase db push|apply_migration/)
})

test("workflow de escrita exige dispatch manual, main, SHA e ambiente de producao", () => {
  assert.match(WORKFLOW, /workflow_dispatch:/)
  assert.match(WORKFLOW, /environment: production/)
  assert.match(WORKFLOW, /expected_sha:/)
  assert.match(WORKFLOW, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  assert.match(WORKFLOW, /bash scripts\/audit\/apply-issue-138-production\.sh/)
  assert.equal((WORKFLOW.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  assert.doesNotMatch(WORKFLOW, /inputs:\s*[\s\S]*migration:/)
})

test("rollback de dados e fechado e o rollback de schema exige compatibilidade explicita", () => {
  assert.match(ROLLBACK, /backfill_version=20260829100100/)
  assert.match(ROLLBACK, /DELETE FROM supabase_migrations\.schema_migrations/)
  assert.match(ROLLBACK, /rollback de dados/)
  assert.match(ROLLBACK_WORKFLOW, /workflow_dispatch:/)
  assert.match(ROLLBACK_WORKFLOW, /environment: production/)
  assert.match(SCHEMA_ROLLBACK, /pf\.issue_138_schema_rollback_compatibility/)
  assert.match(SCHEMA_ROLLBACK, /colisoes cross-source/)
  assert.match(SCHEMA_ROLLBACK, /alvos Camara=/)
  assert.match(SCHEMA_ROLLBACK, /ADD CONSTRAINT uq_projetos_lei_candidato_proposicao/)
  assert.match(SCHEMA_ROLLBACK, /DROP INDEX public\.uq_projetos_lei_candidato_fonte_proposicao/)
  assert.ok(
    SCHEMA_ROLLBACK.indexOf("colisoes cross-source") <
      SCHEMA_ROLLBACK.indexOf("ADD CONSTRAINT uq_projetos_lei_candidato_proposicao"),
  )
})

test("manifesto nomeia aprovacao e artefatos de compensacao sem payload SQL", () => {
  assert.equal(MANIFEST.version, 1)
  assert.equal(MANIFEST.reversible, true)
  assert.equal(MANIFEST.approval.status, "required-before-execution")
  assert.equal(MANIFEST.approval.required_approver, "Thiago Salvador")
  assert.equal(MANIFEST.approval.execution, "manual-workflow-dispatch-only")
  assert.equal(MANIFEST.rollback.artifact, "scripts/audit/rollback-issue-138-production.sh")
  assert.ok(MANIFEST.verification.checks.includes("ddl-backfill-ledger-idempotency-hashes"))
  assert.ok(!JSON.stringify(MANIFEST).match(/"(?:sql|query|statement)"/i))
})
