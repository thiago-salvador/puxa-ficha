import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

const version = "20261001100000"
const name = "cpf_removido_motivo_trajetoria"
const runnerPath = "scripts/audit/apply-cpf-removido-motivo-trajetoria-production.sh"
const workflowPath = ".github/workflows/apply-cpf-removido-motivo-trajetoria-production.yml"
const runner = readFileSync(runnerPath, "utf8")
const workflow = readFileSync(workflowPath, "utf8")
const migration = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8")
const readback = readFileSync(`supabase/readback/${version}_${name}.readback.sql`, "utf8")
const recortes = JSON.parse(readFileSync("scripts/audit/recortes.json", "utf8")) as {
  recortes: Array<{ nome: string; desde?: string; ate: string; allowlist: string }>
}

const IDS = [
  "e0c26051-9de3-4135-86fb-f9ba72028a30",
  "4d71e1ab-10fb-4d57-8bb3-b118cdd404e7",
  "3df17e2a-4fb3-4701-9e74-69c8e9f8ce4c",
  "db46d0a9-a822-4029-9007-62b7da0155a1",
  "9120d6d7-5010-4709-99de-a76422250fbf",
  "fd2ff3cd-9323-4022-9692-138e98f7788f",
  "8d36bb5a-1e41-4788-b17c-cbd9dd854fa9",
]

test("runner fixa a migration, o predecessor G5 no topo do ledger e o projeto de produção", () => {
  for (const value of [
    "base_version=20260929110000",
    "${base_version}_g5_processo_hana_helder.sql",
    `version=${version}`,
    `name=${name}`,
    "wskpzsobvqwhnbsdsmok",
    "pg_advisory_xact_lock",
    "INSERT INTO supabase_migrations.schema_migrations",
    "PGSSLMODE=verify-full",
    "default_transaction_read_only=on",
    "git ls-remote",
    "checkout sujo",
    "gerar_sql ROLLBACK",
    "gerar_sql COMMIT",
  ]) {
    assert.ok(runner.includes(value), value)
  }
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  const apply = runner.slice(runner.lastIndexOf("gerar_sql ROLLBACK"))
  assert.ok(apply.indexOf("gerar_sql COMMIT") > 0)
})

test("workflow é manual, só main, ensaia antes de gravar e não revalida linha despublicada", () => {
  for (const value of [
    "workflow_dispatch:",
    "environment: production",
    "group: production-db-migrations",
    "cancel-in-progress: false",
    'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"',
    "persist-credentials: false",
    "if: github.ref == 'refs/heads/main'",
    "permissions:\n  contents: read",
    "- dry-run\n          - apply",
  ]) {
    assert.ok(workflow.includes(value), value)
  }
  assert.doesNotMatch(workflow, /^\s+(push|schedule|pull_request|pull_request_target):/m)
  const ensaio = workflow.indexOf("apply-cpf-removido-motivo-trajetoria-production.sh dry-run")
  const grava = workflow.indexOf("apply-cpf-removido-motivo-trajetoria-production.sh apply")
  assert.ok(ensaio > 0 && grava > ensaio, "dry-run antes do apply")
  assert.match(workflow.slice(workflow.lastIndexOf("- name: Aplicar"), grava), /if: \$\{\{ github\.event\.inputs\.mode == 'apply' \}\}/)
  assert.doesNotMatch(workflow, /PF_REVALIDATE_SECRET/)
})

test("migration e readback fecham as sete linhas por id, sem CPF nem hash de CPF", () => {
  for (const id of IDS) {
    assert.ok(migration.includes(`'${id}'`), id)
    assert.ok(readback.includes(`'${id}'`), id)
  }
  assert.match(readback, /version = '20261001100000'/)
  assert.match(readback, /IF n <> 7 THEN RAISE EXCEPTION 'readback cpf-motivo/)
  assert.match(readback, /execucao = 'migration:20261001100000'/)
  assert.doesNotMatch(migration + readback, /(?<!\d)\d{11}(?!\d)/)
  assert.doesNotMatch(migration + readback, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)
  assert.doesNotMatch(migration + readback, /\bmd5\s*\(|sha256|digest\s*\(/i)
})

test("recorte próprio, sem sobreposição", () => {
  const recorte = recortes.recortes.find((r) => r.nome === "cpf-removido-motivo-trajetoria-20261001")
  assert.ok(recorte)
  assert.equal(recorte.desde, version)
  assert.equal(recorte.ate, version)
  assert.equal(recorte.allowlist, "scripts/audit/allowlist-cpf-removido-motivo-trajetoria-20261001.json")
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
