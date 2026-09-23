import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { buildJournal, casIdentity, journalIntegrity, normalizeCargo, validateJournal, type DatabaseCandidate, type SourceMatch } from "../scripts/backfill-numero-urna"
import { planRollback } from "../scripts/rollback-numero-urna-backfill"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

test("CAS preserves mixed case cargo and null national UF from the database", () => {
  const row: Pick<DatabaseCandidate, "sq_candidato_2026" | "estado" | "cargo_disputado"> = { sq_candidato_2026: "123", estado: null, cargo_disputado: "Presidente" }
  const match: SourceMatch = { sq: "123", uf: "BR", cargo: "PRESIDENTE", numero: "13", nome: "Candidata" }
  assert.equal(normalizeCargo(row.cargo_disputado ?? ""), "PRESIDENTE")
  assert.deepEqual(casIdentity(row, match), { sq: "123", estado: null, cargo: "Presidente" })
})

test("CAS rejects a UF or cargo identity that does not match the official row", () => {
  assert.throws(() => casIdentity(
    { sq_candidato_2026: "123", estado: "SP", cargo_disputado: "Presidente" },
    { sq: "123", uf: "BR", cargo: "PRESIDENTE", numero: "13", nome: "Candidata" },
  ), /identity mismatch/)
})

test("numero_urna migration exposes text, composite lookup index and public view column", () => {
  const migration = read("supabase/migrations/20260923140000_numero_urna_schema.sql")
  assert.match(migration, /ADD COLUMN IF NOT EXISTS numero_urna text/i)
  assert.match(migration, /candidatos_numero_urna_estado_cargo_idx/i)
  assert.match(migration, /GRANT SELECT \(numero_urna\)[\s\S]*anon, authenticated/)
  assert.match(migration, /formacao_instituicao,\s+numero_urna/i)
})

test("numero_urna readback is read-only and workflows pin the predecessor and SHA", () => {
  const readback = read("supabase/readback/20260923140000_numero_urna_schema.readback.sql")
  assert.doesNotMatch(readback, /\b(BEGIN|COMMIT);|\bSET ROLE\b/i)

  for (const path of [
    "scripts/audit/apply-numero-urna-production.sh",
    "scripts/audit/rollback-numero-urna-production.sh",
  ]) {
    const script = read(path)
    assert.match(script, /PF_EXPECTED_SHA/)
    assert.match(script, /20260923130000/)
    assert.match(script, /refs\/heads\/main/)
  }
})

const officialZip = process.env.PF_CONSULTA_CAND_2026_ZIP ?? "/tmp/puxa-ficha-consulta-cand-2026-20260923.zip"

test("backfill dry-run reconciles the pinned official package without database writes", {
  skip: !process.env.PF_CONSULTA_CAND_2026_ZIP && !existsSync(officialZip),
}, () => {
  assert.ok(existsSync(officialZip), `official ZIP missing: ${officialZip}`)
  const result = spawnSync("npx", ["tsx", "scripts/backfill-numero-urna.ts", "--zip", officialZip], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout) as { seedMatchedCount: number; seedUnmatchedCount: number; sourceAggregateConflicts: string[]; database: string }
  assert.equal(report.seedMatchedCount, 390)
  assert.equal(report.seedUnmatchedCount, 0)
  assert.deepEqual(report.sourceAggregateConflicts, [])
  assert.equal(report.database, "skipped")
})

test("backfill requires the registered source and explicit CAS confirmation for writes", () => {
  const script = read("scripts/backfill-numero-urna.ts")
  assert.match(script, /--zip é obrigatório/)
  assert.match(script, /PF_NUMERO_URNA_APPLY_CONFIRM !== "I_CONFIRM_CAS"/)
  assert.match(script, /\.is\("numero_urna", null\)/)
  assert.match(script, /numero-urna-source\.json/)
})

test("rollback refuses to remove reconciled values", () => {
  const rollback = read("supabase/rollback/20260923140000_numero_urna_schema.rollback.sql")
  assert.match(rollback, /numero_urna IS NOT NULL/)
  assert.match(rollback, /DROP COLUMN numero_urna/)
})

test("journal has a reproducible integrity checksum and rejects tampering", () => {
  const journal = buildJournal("a".repeat(64), [{ id: "id-1", slug: "candidato-1", sq: "123", estado: "SP", cargo: "Deputado", officialNumber: "13", sourceSha256: "a".repeat(64) }], "2026-09-23T00:00:00.000Z")
  assert.equal(journal.integritySha256, journalIntegrity({ ...journal, integritySha256: undefined } as never))
  assert.deepEqual(validateJournal(journal), journal)
  assert.throws(() => validateJournal({ ...journal, rows: [{ ...journal.rows[0], officialNumber: "99" }] }), /checksum/)
})

test("rollback plan skips null rows and restores only the recorded official number", () => {
  const journal = buildJournal("a".repeat(64), [
    { id: "null", slug: "already-null", sq: "1", estado: "SP", cargo: "Deputado", officialNumber: "10", sourceSha256: "a".repeat(64) },
    { id: "filled", slug: "filled", sq: "2", estado: "RJ", cargo: "Senador", officialNumber: "20", sourceSha256: "a".repeat(64) },
  ])
  assert.deepEqual(planRollback(journal, [{ id: "null", numero_urna: null }, { id: "filled", numero_urna: "20" }]).map((p) => p.action), ["skip-null", "restore-null"])
  assert.throws(() => planRollback(journal, [{ id: "null", numero_urna: "99" }, { id: "filled", numero_urna: "20" }]), /drift/)
})
