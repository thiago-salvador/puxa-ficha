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
const ROSTER_APPLY = readFileSync(join(ROOT, "scripts/audit/apply-candidate-roster-integrity-production.sh"), "utf8")
const ROSTER_STATE_APPLY = readFileSync(join(ROOT, "scripts/audit/apply-candidate-registration-state-production.sh"), "utf8")
const ROSTER_ROLLBACK = readFileSync(join(ROOT, "scripts/audit/rollback-candidate-roster-integrity-production.sh"), "utf8")
const ROSTER_STATE_ROLLBACK = readFileSync(join(ROOT, "scripts/audit/rollback-candidate-registration-state-production.sh"), "utf8")
const ROSTER_WORKFLOW = readFileSync(join(ROOT, ".github/workflows/apply-candidate-roster-integrity-production.yml"), "utf8")
const ROSTER_ROLLBACK_WORKFLOW = readFileSync(join(ROOT, ".github/workflows/rollback-candidate-roster-integrity-production.yml"), "utf8")
const ROSTER_SCHEMA_ROLLBACK = readFileSync(join(ROOT, "supabase/rollback/20260829030001_candidate_roster_publication_integrity_schema.rollback.sql"), "utf8")

test("aplicador da issue 138 e fechado, ordenado e registra rollback por versao", () => {
  assert.match(APPLY, /ddl_version=20260829100000/)
  assert.match(APPLY, /backfill_version=20260829100100/)
  assert.match(APPLY, /previous_version=20260829030002/)
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

test("release predecessor do roster e independente e coordenado", () => {
  assert.match(ROSTER_APPLY, /data_version=20260829030000/)
  assert.match(ROSTER_APPLY, /schema_version=20260829030001/)
  assert.match(ROSTER_APPLY, /successor_version=20260829030002/)
  assert.match(ROSTER_APPLY, /successor_hash/)
  assert.match(ROSTER_APPLY, /previous_version=20260828025037/)
  assert.match(ROSTER_APPLY, /candidate-roster-integrity-production/)
  assert.match(ROSTER_APPLY, /data_rollback=/)
  assert.match(ROSTER_APPLY, /schema_rollback=/)
  assert.match(ROSTER_APPLY, /readback=/)
  assert.match(ROSTER_APPLY, /INSERT INTO supabase_migrations\.schema_migrations/)
  assert.doesNotMatch(ROSTER_APPLY, /29100000|29100100/)
  assert.match(ROSTER_STATE_APPLY, /version=20260829030002/)
  assert.match(ROSTER_STATE_APPLY, /previous_version=20260829030001/)
  assert.match(ROSTER_STATE_APPLY, /candidate-roster-integrity-production/)
  assert.match(ROSTER_STATE_APPLY, /idempotency_key/)
  assert.doesNotMatch(ROSTER_STATE_APPLY, /29100000|29100100/)
  assert.match(ROSTER_STATE_ROLLBACK, /version=20260829030002/)
  assert.match(ROSTER_STATE_ROLLBACK, /previous_version=20260829030001/)
  assert.match(ROSTER_STATE_ROLLBACK, /DELETE FROM supabase_migrations\.schema_migrations/)
  assert.match(ROSTER_ROLLBACK, /DELETE FROM supabase_migrations\.schema_migrations WHERE \(version=/)
  assert.match(ROSTER_ROLLBACK, /previous_version=20260828025037/)
  assert.match(ROSTER_SCHEMA_ROLLBACK, /fail-closed/)
  assert.match(ROSTER_WORKFLOW, /workflow_dispatch:/)
  assert.match(ROSTER_WORKFLOW, /apply-candidate-registration-state-production\.sh/)
  assert.match(ROSTER_ROLLBACK_WORKFLOW, /workflow_dispatch:/)
  assert.match(ROSTER_ROLLBACK_WORKFLOW, /rollback-candidate-registration-state-production\.sh/)

  const applyGuard = ROSTER_STATE_APPLY.indexOf("ledger divergiu sob lock")
  const applyWrite = ROSTER_STATE_APPLY.indexOf('print(body')
  assert.ok(applyGuard >= 0 && applyGuard < applyWrite)
  assert.match(
    ROSTER_STATE_APPLY.slice(applyGuard - 500, applyWrite),
    /idempotency_key=.*previous_digest/,
  )

  const stateRollbackGuard = ROSTER_STATE_ROLLBACK.indexOf("ledger divergiu sob lock")
  const stateRollbackWrite = ROSTER_STATE_ROLLBACK.indexOf('print(body')
  const stateRollbackDelete = ROSTER_STATE_ROLLBACK.indexOf("DELETE FROM supabase_migrations.schema_migrations")
  assert.ok(stateRollbackGuard >= 0 && stateRollbackGuard < stateRollbackWrite)
  assert.ok(stateRollbackWrite < stateRollbackDelete)
  assert.match(
    ROSTER_STATE_ROLLBACK.slice(stateRollbackDelete, stateRollbackDelete + 220),
    /version=.*idempotency_key=.*digest/,
  )

  const rosterRollbackGuard = ROSTER_ROLLBACK.indexOf("ledger divergiu sob lock")
  const rosterRollbackWrite = ROSTER_ROLLBACK.indexOf('print(body')
  const rosterRollbackDelete = ROSTER_ROLLBACK.indexOf("DELETE FROM supabase_migrations.schema_migrations")
  assert.ok(rosterRollbackGuard >= 0 && rosterRollbackGuard < rosterRollbackWrite)
  assert.ok(rosterRollbackWrite < rosterRollbackDelete)
  assert.match(
    ROSTER_ROLLBACK.slice(rosterRollbackDelete, rosterRollbackDelete + 380),
    /version=.*data_version.*idempotency_key=.*data_digest[\s\S]*version=.*schema_version.*idempotency_key=.*schema_digest/,
  )

  assert.ok(
    ROSTER_WORKFLOW.indexOf("audit:candidate-integrity:prove") <
      ROSTER_WORKFLOW.indexOf("apply-candidate-roster-integrity-production.sh"),
  )
  assert.ok(
    ROSTER_WORKFLOW.indexOf("apply-candidate-roster-integrity-production.sh") <
      ROSTER_WORKFLOW.lastIndexOf("run: bash scripts/audit/apply-candidate-registration-state-production.sh"),
  )
  assert.ok(
    ROSTER_ROLLBACK_WORKFLOW.lastIndexOf("run: bash scripts/audit/rollback-candidate-registration-state-production.sh") <
      ROSTER_ROLLBACK_WORKFLOW.indexOf("rollback-candidate-roster-integrity-production.sh"),
  )
})

test("workflow residual mantém backup, dry-run, apply, readback e receipt nessa ordem", () => {
  const applyBackup = ROSTER_WORKFLOW.indexOf("apply-candidate-registration-state-production.sh --backup-only")
  const applyDryRun = ROSTER_WORKFLOW.indexOf("audit:candidate-integrity:prove")
  const applyWrite = ROSTER_WORKFLOW.lastIndexOf("run: bash scripts/audit/apply-candidate-registration-state-production.sh")
  assert.ok(applyBackup >= 0 && applyBackup < applyDryRun && applyDryRun < applyWrite)
  assert.match(ROSTER_WORKFLOW, /actions\/upload-artifact@[0-9a-f]{40}/)
  assert.match(ROSTER_STATE_APPLY, /default_transaction_read_only=on[\s\S]*> "\$PF_BACKUP_PATH"/)
  assert.ok(ROSTER_STATE_APPLY.indexOf('psql -X -v ON_ERROR_STOP=1 -f "$readback"') < ROSTER_STATE_APPLY.lastIndexOf("\nwrite_receipt\n"))
  assert.match(ROSTER_STATE_APPLY, /INSERT INTO public\.coleta_log[\s\S]*RETURNING id/)
  assert.match(ROSTER_STATE_APPLY, /receipt_count[\s\S]*receipt_inserted[\s\S]*receipt_id/)

  const rollbackBackup = ROSTER_ROLLBACK_WORKFLOW.indexOf("rollback-candidate-registration-state-production.sh --backup-only")
  const rollbackDryRun = ROSTER_ROLLBACK_WORKFLOW.indexOf("audit:candidate-integrity:prove")
  const rollbackWrite = ROSTER_ROLLBACK_WORKFLOW.lastIndexOf("run: bash scripts/audit/rollback-candidate-registration-state-production.sh")
  assert.ok(rollbackBackup >= 0 && rollbackBackup < rollbackDryRun && rollbackDryRun < rollbackWrite)
  assert.match(ROSTER_ROLLBACK_WORKFLOW, /actions\/upload-artifact@[0-9a-f]{40}/)
  assert.ok(ROSTER_STATE_ROLLBACK.indexOf("post_count=") < ROSTER_STATE_ROLLBACK.indexOf("INSERT INTO public.coleta_log"))
  assert.match(ROSTER_STATE_ROLLBACK, /INSERT INTO public\.coleta_log[\s\S]*RETURNING id/)
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

test("manifesto mantém 30002 entre o roster e a release de proposições", () => {
  const roster = MANIFEST.scope.releases.find(
    (release: { name: string }) => release.name === "candidate-roster-integrity",
  )
  const propositions = MANIFEST.scope.releases.find(
    (release: { name: string }) => release.name === "proposicao-source-key",
  )
  assert.deepEqual(roster.versions, ["20260829030000", "20260829030001", "20260829030002"])
  assert.equal(propositions.predecessor, roster.versions.at(-1))
  assert.match(APPLY, new RegExp(`previous_version=${propositions.predecessor}`))
})
