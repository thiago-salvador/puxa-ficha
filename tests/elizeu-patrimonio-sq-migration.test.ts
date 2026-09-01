import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const VERSION = "20260831215407"
const migrationPath = join(ROOT, `supabase/migrations/${VERSION}_corrigir_elizeu_patrimonio_sq.sql`)
const rollbackPath = join(ROOT, `supabase/rollback/${VERSION}_corrigir_elizeu_patrimonio_sq.rollback.sql`)
const readbackPath = join(ROOT, `supabase/readback/${VERSION}_corrigir_elizeu_patrimonio_sq.readback.sql`)
const rollbackReadbackPath = join(ROOT, `supabase/readback/${VERSION}_corrigir_elizeu_patrimonio_sq.rollback.readback.sql`)
const receiptPath = join(ROOT, "QA/evidencias/2026-08-31-elizeu-patrimonio-sq/receipt.json")
const harnessPath = join(ROOT, "scripts/audit/provar-elizeu-patrimonio-sq-pg17.sh")
const applyRunnerPath = join(ROOT, "scripts/audit/apply-elizeu-patrimonio-sq-production.sh")
const rollbackRunnerPath = join(ROOT, "scripts/audit/rollback-elizeu-patrimonio-sq-production.sh")
const applyWorkflowPath = join(ROOT, ".github/workflows/apply-elizeu-patrimonio-sq-production.yml")
const rollbackWorkflowPath = join(ROOT, ".github/workflows/rollback-elizeu-patrimonio-sq-production.yml")
const allowlistPath = join(ROOT, "scripts/audit/allowlist-elizeu-patrimonio-sq-20260831.json")
const recortesPath = join(ROOT, "scripts/audit/recortes.json")
const manifestPath = join(ROOT, ".github/merge-queue/irreversible-change-manifest.json")

test("artefatos da correção de patrimônio existem e preservam a prova oficial", () => {
  for (const path of [
    migrationPath,
    rollbackPath,
    readbackPath,
    rollbackReadbackPath,
    receiptPath,
    harnessPath,
    applyRunnerPath,
    rollbackRunnerPath,
    applyWorkflowPath,
    rollbackWorkflowPath,
    allowlistPath,
  ]) assert.ok(existsSync(path), path)

  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"))
  assert.equal(receipt.candidato.sq_anterior, "180002533958")
  assert.equal(receipt.candidato.sq_atual, "180002549920")
  assert.equal(receipt.consulta_cand_2026.sq_anterior_ocorrencias_pi, 0)
  assert.equal(receipt.consulta_cand_2026.sq_atual_ocorrencias_pi, 1)
  assert.equal(receipt.bem_candidato_2026.sq_atual_ocorrencias_pi, 3)
  assert.equal(receipt.bem_candidato_2026.valor_total, 1592808)
  assert.equal(receipt.bem_candidato_2026.sha256, "21a7f4bf799f7784e63c13a152f39bcc554239fa24c11a043cdaf572a944f65c")
})

test("migration é fechada ao alvo, ao SQ confirmado e à ausência sem evidência", () => {
  const migration = readFileSync(migrationPath, "utf8")
  assert.match(migration, /sq_candidato_2026 IS NULL/)
  assert.match(migration, /titular_sq_candidato = '180002549920'/)
  assert.match(migration, /SET sq_candidato_2026 = '180002549920'/)
  assert.match(migration, /valor_total = 1592808\.00/)
  assert.match(migration, /"valor":802808/)
  assert.match(migration, /21a7f4bf799f7784e63c13a152f39bcc554239fa24c11a043cdaf572a944f65c/)
  assert.match(migration, /DELETE FROM public\.patrimonio_ausencia_oficial/)
  assert.match(migration, /07f80302-9048-49f7-9b13-5a992f48e6c0/)
  assert.match(migration, /forward_receipt_count <> 0/)
  assert.match(migration, /other_candidates_digest IS DISTINCT FROM before_candidates_digest/)
  assert.match(migration, /other_patrimonio_digest IS DISTINCT FROM before_patrimonio_digest/)
  assert.match(migration, /other_absences_digest IS DISTINCT FROM before_absences_digest/)
})

test("rollback restaura o estado exato e recusa ledger posterior", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
  assert.match(rollback, /SET sq_candidato_2026 = NULL/)
  assert.match(rollback, /valor_total = 872808\.00/)
  assert.match(rollback, /VALUES \([\s\S]*07f80302-9048-49f7-9b13-5a992f48e6c0/)
  assert.match(rollback, /version >= '20260831215407'/)
  assert.match(rollback, /ledger_top <> '20260831215407'/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations/)
  assert.match(rollbackReadback, /dr_luisinho_absence_count <> 1/)
  assert.match(rollbackReadback, /ausencia_dr_luisinho=%/)
})

test("runners de produção fecham SHA, projeto, predecessor, digest, lock e readbacks", () => {
  const applyRunner = readFileSync(applyRunnerPath, "utf8")
  const rollbackRunner = readFileSync(rollbackRunnerPath, "utf8")
  for (const runner of [applyRunner, rollbackRunner]) {
    assert.match(runner, /PF_EXPECTED_SHA/)
    assert.match(runner, /refs\/heads\/main/)
    assert.match(runner, /git ls-remote/)
    assert.match(runner, /wskpzsobvqwhnbsdsmok/)
    assert.match(runner, /PGSSLMODE=verify-full/)
    assert.match(runner, /20260830151500/)
    assert.match(runner, /sha256:59c212dd68c913a2e98836cf109ad32fa9bc21b40826bb67035a277589ab095a/)
    assert.match(runner, /puxa-ficha:patrimonio-2026-reconciliation-production/)
    assert.match(runner, /idempotency_key/)
  }
  assert.match(applyRunner, /corrigir_elizeu_patrimonio_sq\.readback\.sql/)
  assert.match(rollbackRunner, /corrigir_elizeu_patrimonio_sq\.rollback\.readback\.sql/)
})

test("workflows são manuais, serializados e provam PostgreSQL 17 antes da escrita", () => {
  for (const path of [applyWorkflowPath, rollbackWorkflowPath]) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /group: production-db-migrations/)
    assert.match(workflow, /provar-elizeu-patrimonio-sq-pg17\.sh/)
    assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
    assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/)
  }
})

test("allowlist, recorte e manifesto irreversível nomeiam exatamente esta release", () => {
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"))
  assert.deepEqual(allowlist.coorte, ["elizeu-aguiar", "dr-luisinho"])
  assert.equal(allowlist.entries.length, 3)
  assert.equal(allowlist.referencias.length, 1)

  const recortes = JSON.parse(readFileSync(recortesPath, "utf8"))
  assert.deepEqual(recortes.recortes.find((entry: { nome: string }) => entry.nome === "elizeu-patrimonio-sq-20260831"), {
    nome: "elizeu-patrimonio-sq-20260831",
    desde: VERSION,
    ate: VERSION,
    allowlist: "scripts/audit/allowlist-elizeu-patrimonio-sq-20260831.json",
    divida: null,
  })

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.deepEqual(manifest.scope.releases.find((entry: { name: string }) => entry.name === "elizeu-patrimonio-sq"), {
    name: "elizeu-patrimonio-sq",
    predecessor: "20260830151500",
    versions: [VERSION],
    apply_artifact: "scripts/audit/apply-elizeu-patrimonio-sq-production.sh",
    apply_workflow: ".github/workflows/apply-elizeu-patrimonio-sq-production.yml",
    rollback_artifact: "scripts/audit/rollback-elizeu-patrimonio-sq-production.sh",
    rollback_workflow: ".github/workflows/rollback-elizeu-patrimonio-sq-production.yml",
  })
})

test("harness cobre adulteração, migration posterior e sentinelas", () => {
  const harness = readFileSync(harnessPath, "utf8")
  assert.match(harness, /postgres:17@sha256:/)
  assert.match(harness, /migration aceitou patrimonio anterior adulterado/)
  assert.match(harness, /forward readback aceitou patrimonio adulterado/)
  assert.match(harness, /rollback aceitou migration posterior/)
  assert.match(harness, /before_candidates/)
  assert.match(harness, /before_patrimonio/)
  assert.match(harness, /before_absences/)
})
