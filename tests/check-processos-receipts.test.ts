import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  checkProcessosReceipts,
  parseSnapshot,
  type CoverageSnapshotRow,
} from "../scripts/audit/check-processos-receipts"

const now = new Date("2026-09-24T12:00:00.000Z")
const row = (overrides: Partial<CoverageSnapshotRow> = {}): CoverageSnapshotRow => ({
  candidate_id: "id-1",
  slug: "candidato-1",
  receipt_candidate_id: "id-1",
  receipt_slug: "candidato-1",
  receipt_source: "processos-curadoria",
  receipt_scope: "candidato",
  receipt_executed_at: "2026-09-24T10:00:00.000Z",
  receipt_result: "vazio_confirmado",
  receipt_volume: 0,
  has_receipt: true,
  ...overrides,
})

test("candidato público novo sem recibo reprova, enquanto recibo válido passa", () => {
  const report = checkProcessosReceipts([row(), row({ candidate_id: "id-2", slug: "novo", has_receipt: false, receipt_candidate_id: null, receipt_slug: null, receipt_source: null, receipt_scope: null, receipt_executed_at: null, receipt_result: null, receipt_volume: null })], { now })
  assert.equal(report.ok, false)
  assert.equal(report.summary.vazio_confirmado, 1)
  assert.equal(report.summary.sem_recibo, 1)
  assert.deepEqual(report.missing_candidate_ids, ["id-2"])

  const valid = checkProcessosReceipts([row()], { now })
  assert.equal(valid.ok, true)
  assert.equal(valid.missing_candidate_ids.length, 0)
})

test("CLI do gate sai 1 com candidato novo sem recibo e 0 no controle", () => {
  const checker = fileURLToPath(new URL("../scripts/audit/check-processos-receipts.ts", import.meta.url))
  const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/processos-receipts/${name}.json`, import.meta.url))
  const run = (name: string) => spawnSync(process.execPath, ["--import", "tsx", checker, `--input=${fixture(name)}`], {
    encoding: "utf8",
  })
  const control = run("with-receipt")
  const missing = run("without-receipt")
  assert.equal(control.status, 0, control.stderr)
  assert.equal(JSON.parse(control.stdout).missing_receipts, 0)
  assert.equal(missing.status, 1, missing.stderr)
  assert.equal(JSON.parse(missing.stdout).missing_receipts, 1)
})

test("separa recibo vencido, erro, indeterminado, encontrado e vazio confirmado", () => {
  const report = checkProcessosReceipts([
    row(),
    row({ candidate_id: "id-2", slug: "stale", receipt_candidate_id: "id-2", receipt_slug: "stale", receipt_executed_at: "2026-09-01T10:00:00.000Z", receipt_result: "encontrado", receipt_volume: 1 }),
    row({ candidate_id: "id-3", slug: "erro", receipt_candidate_id: "id-3", receipt_slug: "erro", receipt_result: "erro" }),
    row({ candidate_id: "id-4", slug: "incerto", receipt_candidate_id: "id-4", receipt_slug: "incerto", receipt_result: "bloqueado" }),
    row({ candidate_id: "id-5", slug: "achado", receipt_candidate_id: "id-5", receipt_slug: "achado", receipt_result: "encontrado", receipt_volume: 1 }),
  ], { now })
  assert.deepEqual(report.summary, { sem_recibo: 0, stale: 1, erro: 1, indeterminado: 1, encontrado: 1, vazio_confirmado: 1 })
  assert.equal(report.ok, true)
})

test("não aceita identidade, fonte, escopo ou timestamp fora do contrato", () => {
  const report = checkProcessosReceipts([
    row({ receipt_candidate_id: "outro" }),
    row({ candidate_id: "id-2", slug: "escopo", receipt_candidate_id: "id-2", receipt_slug: "escopo", receipt_scope: "global" }),
    row({ candidate_id: "id-3", slug: "futuro", receipt_candidate_id: "id-3", receipt_slug: "futuro", receipt_executed_at: "2026-09-25T00:00:00.000Z" }),
  ], { now })
  assert.equal(report.summary.indeterminado, 3)
  assert.equal(report.summary.sem_recibo, 0)
  assert.equal(report.invalid_rows, 3)
  assert.equal(report.ok, false)
})

test("has_receipt sem identidade não cobre candidato e reprova o gate", () => {
  const report = checkProcessosReceipts([row({ receipt_candidate_id: null, has_receipt: true })], { now })
  assert.equal(report.ok, false)
  assert.equal(report.invalid_rows, 1)
})

test("volume contraditório não prova vazio nem achado", () => {
  const report = checkProcessosReceipts([
    row({ receipt_volume: 5 }),
    row({ candidate_id: "id-2", slug: "achado-sem-volume", receipt_candidate_id: "id-2", receipt_slug: "achado-sem-volume", receipt_result: "encontrado", receipt_volume: 0 }),
  ], { now })
  assert.equal(report.ok, false)
  assert.equal(report.invalid_rows, 2)
  assert.equal(report.summary.indeterminado, 2)
})

test("recusa snapshot vazio e coorte duplicada", () => {
  assert.throws(() => checkProcessosReceipts([], { now }), /snapshot vazio/)
  assert.throws(() => checkProcessosReceipts([row(), row({ candidate_id: "id-1", slug: "outro" })], { now }), /snapshot duplicado/)
  assert.throws(() => checkProcessosReceipts([row(), row({ candidate_id: "id-2", slug: "candidato-1" })], { now }), /snapshot duplicado/)
})

test("parseSnapshot exige rows e campos públicos mínimos", () => {
  assert.equal(parseSnapshot({ rows: [row()] }).length, 1)
  assert.throws(() => parseSnapshot({ rows: [{ candidate_id: "id-1" }] }), /candidate_id ou slug/)
  assert.throws(() => parseSnapshot({}), /rows\[\]/)
})
