import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const VERSION = "20260830151500"
const migrationPath = join(ROOT, `supabase/migrations/${VERSION}_destaques_freshness_reconciliation.sql`)
const readbackPath = join(ROOT, `supabase/readback/${VERSION}_destaques_freshness_reconciliation.readback.sql`)
const rollbackReadbackPath = join(ROOT, `supabase/readback/${VERSION}_destaques_freshness_reconciliation.rollback.readback.sql`)
const rollbackPath = join(ROOT, `supabase/rollback/${VERSION}_destaques_freshness_reconciliation.rollback.sql`)
const fixturePath = join(ROOT, "QA/evidencias/2026-08-30-destaques-votacoes/migration-fixture.sql")
const generatorPath = join(ROOT, "scripts/audit/generate-destaques-freshness-reconciliation.mjs")
const harnessPath = join(ROOT, "scripts/audit/provar-destaques-freshness-reconciliation-pg17.sh")
const applyRunnerPath = join(ROOT, "scripts/audit/apply-destaques-freshness-reconciliation-production.sh")
const rollbackRunnerPath = join(ROOT, "scripts/audit/rollback-destaques-freshness-reconciliation-production.sh")
const applyWorkflowPath = join(ROOT, ".github/workflows/apply-destaques-freshness-reconciliation-production.yml")
const rollbackWorkflowPath = join(ROOT, ".github/workflows/rollback-destaques-freshness-reconciliation-production.yml")
const irreversibleManifest = JSON.parse(readFileSync(join(ROOT, ".github/merge-queue/irreversible-change-manifest.json"), "utf8")) as {
  scope: { releases: Array<Record<string, unknown>> }
}

describe("migration de reconciliação da freshness de votações", () => {
  test("artefatos são separados, gerados do manifesto e permanecem fora de produção", () => {
    for (const path of [migrationPath, readbackPath, rollbackReadbackPath, rollbackPath, fixturePath, generatorPath, harnessPath, applyRunnerPath, rollbackRunnerPath, applyWorkflowPath, rollbackWorkflowPath]) {
      assert.ok(existsSync(path), path)
    }
    const generator = readFileSync(generatorPath, "utf8")
    assert.match(generator, /run-d\/manifest\.json/)
    assert.match(generator, /double-read-receipt\.json/)
    assert.match(generator, /manifest\.pairs\.length !== 154/)
    assert.match(generator, /manifest\.sources\.length !== 93/)
  })

  test("preserva as 181 linhas antigas e supersede por 155 recibos reais", () => {
    const migration = readFileSync(migrationPath, "utf8")
    assert.match(migration, /old_receipts<>181/)
    assert.match(migration, /old_count<>before_count/)
    assert.doesNotMatch(migration, /DELETE FROM public\.coleta_log[\s\S]*destaques-votacoes/i)
    assert.match(migration, /new_receipts<>155/)
    assert.match(migration, /pair_receipts<>154/)
    assert.equal(migration.match(/provenance_v1:/g)?.length, 155)
    assert.match(migration, /2026-08-30T20:18:/)
    assert.match(migration, /0f8dd668625c620f4fee22439c8c450c2f92edb18e6edd5e0d49faed9ea5751f/)
  })

  test("remove somente os dois pares não confirmados e mantém JHC como artigo_17", () => {
    const migration = readFileSync(migrationPath, "utf8")
    assert.match(migration, /remaining_pairs<>152/)
    assert.match(migration, /538fb04d-8fb4-486f-a7dd-9c78399a6353:7fa2b07b-f390-4d0f-87d5-354a68b1c593/)
    assert.match(migration, /a5fa816e-9e3b-40ae-8679-71568bed63da:373ebd9f-4793-47c0-a23e-5a660ff2dd14/)
    assert.match(migration, /ba62f5d0-3e39-40a7-a0af-ee1d86e97e75[\s\S]*artigo_17/)
    assert.match(migration, /20260830143500_jhc_voto_artigo_17/)
  })

  test("preenche três IDs oficiais e mantém dois gaps sem inferência", () => {
    const migration = readFileSync(migrationPath, "utf8")
    const readback = readFileSync(readbackPath, "utf8")
    for (const apiId of ["2270789-73", "2357053-47", "2196833-326"]) {
      assert.match(migration, new RegExp(apiId))
      assert.match(readback, new RegExp(apiId))
    }
    assert.match(migration, /mapped_metadata<>3/)
    assert.match(migration, /unresolved_metadata<>2/)
    assert.match(readback, /source_gaps/)
  })

  test("readback e rollback recusam adulteração e exigem o ledger exato", () => {
    const readback = readFileSync(readbackPath, "utf8")
    const rollback = readFileSync(rollbackPath, "utf8")
    const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
    const harness = readFileSync(harnessPath, "utf8")
    assert.match(readback, /pair_details_md5/)
    assert.match(readback, /ledger<>1/)
    assert.match(rollback, /bad_receipts<>0/)
    assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations/)
    assert.match(rollback, /INSERT INTO public\.votos_candidato\(id,candidato_id,votacao_id,voto,contradicao,contradicao_descricao,created_at\)/)
    assert.match(rollback, /v\.id IS DISTINCT FROM e\.database_row_id/)
    assert.match(rollbackReadback, /rollback readback destaques freshness falhou/)
    assert.match(rollbackReadback, /v\.created_at IS DISTINCT FROM e\.created_at_anterior/)
    assert.match(harness, /postgres:17@sha256:/)
    assert.match(harness, /readback aceitou recibo adulterado/)
    assert.match(harness, /rollback aceitou par posterior/)
    assert.match(harness, /rollback não restaurou votos_candidato byte a byte/)
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
      assert.match(runner, /20260830143500/)
      assert.match(runner, /sha256:1283572d3eea21bb04408bdf1aef845ad376c05c87241183eea9a726dc1bdfa9/)
      assert.match(runner, /puxa-ficha:destaques-freshness-production/)
      assert.match(runner, /idempotency_key/)
    }
    assert.match(applyRunner, /destaques_freshness_reconciliation\.readback\.sql/)
    assert.match(rollbackRunner, /destaques_freshness_reconciliation\.rollback\.readback\.sql/)
  })

  test("workflows de produção são manuais, serializados e provam PG17 antes de escrever", () => {
    const applyWorkflow = readFileSync(applyWorkflowPath, "utf8")
    const rollbackWorkflow = readFileSync(rollbackWorkflowPath, "utf8")
    for (const workflow of [applyWorkflow, rollbackWorkflow]) {
      assert.match(workflow, /workflow_dispatch:/)
      assert.match(workflow, /environment: production/)
      assert.match(workflow, /group: production-db-migrations/)
      assert.match(workflow, /provar-destaques-freshness-reconciliation-pg17\.sh/)
      assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
      assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/)
    }
    assert.match(applyWorkflow, /apply-destaques-freshness-reconciliation-production\.sh/)
    assert.match(rollbackWorkflow, /rollback-destaques-freshness-reconciliation-production\.sh/)
  })

  test("manifesto irreversível nomeia a release e seus artefatos operacionais", () => {
    const release = irreversibleManifest.scope.releases.find((entry) => entry.name === "destaques-freshness-reconciliation")
    assert.deepEqual(release, {
      name: "destaques-freshness-reconciliation",
      predecessor: "20260830143500",
      versions: [VERSION],
      apply_artifact: "scripts/audit/apply-destaques-freshness-reconciliation-production.sh",
      apply_workflow: ".github/workflows/apply-destaques-freshness-reconciliation-production.yml",
      rollback_artifact: "scripts/audit/rollback-destaques-freshness-reconciliation-production.sh",
      rollback_workflow: ".github/workflows/rollback-destaques-freshness-reconciliation-production.yml",
    })
  })
})
