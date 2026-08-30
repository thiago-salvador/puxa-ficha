import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const VERSION = "20260830151500"
const migrationPath = join(ROOT, `supabase/migrations/${VERSION}_destaques_freshness_reconciliation.sql`)
const readbackPath = join(ROOT, `supabase/readback/${VERSION}_destaques_freshness_reconciliation.readback.sql`)
const rollbackPath = join(ROOT, `supabase/rollback/${VERSION}_destaques_freshness_reconciliation.rollback.sql`)
const fixturePath = join(ROOT, "QA/evidencias/2026-08-30-destaques-votacoes/migration-fixture.sql")
const generatorPath = join(ROOT, "scripts/audit/generate-destaques-freshness-reconciliation.mjs")
const harnessPath = join(ROOT, "scripts/audit/provar-destaques-freshness-reconciliation-pg17.sh")

describe("migration de reconciliação da freshness de votações", () => {
  test("artefatos são separados, gerados do manifesto e permanecem fora de produção", () => {
    for (const path of [migrationPath, readbackPath, rollbackPath, fixturePath, generatorPath, harnessPath]) {
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
    assert.match(migration, /2026-08-30T18:00:49\.873Z/)
    assert.match(migration, /57d945379a1d739be747edb87658060af5593d6895b74fa9af74f574d93913ed/)
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
    const harness = readFileSync(harnessPath, "utf8")
    assert.match(readback, /pair_details_md5/)
    assert.match(readback, /ledger<>1/)
    assert.match(rollback, /bad_receipts<>0/)
    assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations/)
    assert.match(harness, /postgres:17@sha256:/)
    assert.match(harness, /readback aceitou recibo adulterado/)
    assert.match(harness, /rollback aceitou par posterior/)
  })
})
