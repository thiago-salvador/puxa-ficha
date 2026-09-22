import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const version = "20260922120000"
const runnerPath = "scripts/audit/apply-financiamento-doador-recorrente-production.sh"
const runner = readFileSync(runnerPath, "utf8")
const applyWorkflow = readFileSync(".github/workflows/apply-financiamento-doador-recorrente-production.yml", "utf8")
const materializeWorkflow = readFileSync(".github/workflows/materializar-doador-recorrente.yml", "utf8")
const proof = readFileSync("scripts/audit/provar-doador-recorrente-pg17.sh", "utf8")
const sha256 = (path: string) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`

test("apply do doador recorrente fixa a migration, o topo atual do ledger e o projeto de produção", () => {
  const predecessor = "supabase/migrations/20260921220000_issue_400_vice_to_capitao_osmar_deferido.sql"
  for (const value of [
    `version=${version}`,
    "previous_version=20260921220000",
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
  assert.match(runner, /financiamento_doador_recorrente\.rollback\.sql/)
  assert.match(runner, /financiamento_doador_recorrente\.readback\.sql/)
})

test("workflow de apply é manual, só main, e prova em PostgreSQL 17 antes de aplicar", () => {
  for (const value of [
    "workflow_dispatch:",
    "environment: production",
    "production-db-migrations",
    'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"',
    "persist-credentials: false",
    "if: github.ref == 'refs/heads/main'",
  ]) {
    assert.ok(applyWorkflow.includes(value), value)
  }
  assert.ok(
    applyWorkflow.indexOf("provar-doador-recorrente-pg17.sh") <
      applyWorkflow.indexOf("apply-financiamento-doador-recorrente-production.sh"),
  )
  assert.equal((applyWorkflow.match(/secrets\.SUPABASE_DB_URL/g) ?? []).length, 2)
  const jobEnv = applyWorkflow.slice(applyWorkflow.indexOf("    env:"), applyWorkflow.indexOf("    steps:"))
  assert.doesNotMatch(jobEnv, /SUPABASE_DB_URL/)
  // A prova roda o readback de verdade, não só a migration.
  assert.match(proof, /file_db prova "\$READBACK"/)
})

test("workflow de materialização escreve só com opt-in e passa pelo gate de exposição depois", () => {
  for (const value of [
    "workflow_dispatch:",
    "environment: production",
    "if: github.ref == 'refs/heads/main'",
    'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"',
    "persist-credentials: false",
    "default: false",
    'PF_DRY_RUN: "1"',
  ]) {
    assert.ok(materializeWorkflow.includes(value), value)
  }
  const aplicar = materializeWorkflow.indexOf("scripts/materializar-doador-recorrente.ts --apply")
  const gate = materializeWorkflow.indexOf("scripts/audit-doador-recorrente-exposure.ts")
  assert.ok(aplicar > 0 && gate > aplicar, "gate de exposição roda depois da escrita")
  const passoAplicar = materializeWorkflow.slice(materializeWorkflow.lastIndexOf("- name:", aplicar), aplicar)
  assert.match(passoAplicar, /if: inputs\.aplicar/)
  // O gate lê como o público: chave anon, nunca service role.
  const passoGate = materializeWorkflow.slice(materializeWorkflow.lastIndexOf("- name:", gate), gate)
  assert.match(passoGate, /SUPABASE_ANON_KEY/)
  assert.doesNotMatch(passoGate, /SERVICE_ROLE/)
  // O segredo de escrita não fica no env do job.
  const jobEnv = materializeWorkflow.slice(materializeWorkflow.indexOf("    env:"), materializeWorkflow.indexOf("    steps:"))
  assert.doesNotMatch(jobEnv, /SERVICE_ROLE|SUPABASE_DB_URL/)
})

test("runner recusa conectar sem contexto explícito de deploy", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PF_DATABASE_URL e obrigatoria/)
})
