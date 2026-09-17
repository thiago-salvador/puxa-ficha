import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  extrairDocumentoRealTime,
  parseTextoRealTimeMsPdf,
  RELATORIO_MS_SHA256,
  RELATORIO_MS_URL,
} from "../scripts/lib/pesquisas-monitoramento-realtime-pdf"

const fixtureRoot = "tests/fixtures/pesquisas-distribuicao/documentos"
const layout = readFileSync(`${fixtureRoot}/realtime-ms.layout.txt`, "utf8")
const pdf = readFileSync(`${fixtureRoot}/realtime-ms.pdf`)

test("extrai o MS-07706/2026 com os três cenários de Governador", () => {
  const report = parseTextoRealTimeMsPdf(layout, "MS-07706/2026")
  assert.deepEqual({
    registration_id: report.registration_id,
    geography_code: report.geography_code,
    office: report.office,
    publication_date: report.publication_date,
    fieldwork: report.fieldwork,
    sample_size: report.sample_size,
    margin_error_pp: report.margin_error_pp,
    confidence_percent: report.confidence_percent,
  }, {
    registration_id: "MS-07706/2026",
    geography_code: "MS",
    office: "Governador",
    publication_date: "2026-08-06",
    fieldwork: { start: "2026-08-01", end: "2026-08-05" },
    sample_size: 1600,
    margin_error_pp: 2,
    confidence_percent: 95,
  })
  assert.deepEqual(report.scenarios.map((scenario) => ({ mode: scenario.mode, turn: scenario.turn, page: scenario.page, question: scenario.question })), [
    { mode: "espontaneo", turn: 1, page: 5, question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO MATO GROSSO DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)" },
    { mode: "estimulado", turn: 1, page: 7, question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO MATO GROSSO DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA SE OS NOMES FOSSEM ESTES?" },
    { mode: "estimulado", turn: 2, page: 12, question: null },
  ])
  assert.equal(report.scenarios[0].results.find((row) => row.raw_label === "João Henrique Cattan")?.value_percent, 4)
  assert.equal(report.scenarios[1].results.find((row) => row.raw_label === "João Henrique Catan (Novo)")?.value_percent, 12)
  assert.equal(report.scenarios[0].results.find((row) => row.raw_label === "Reinaldo Azambuja")?.value_percent, 1)
  for (const scenario of report.scenarios) assert.equal(scenario.results.reduce((sum, row) => sum + row.value_percent, 0), 100)
})

test("extrai o PDF nominal MS e exige o hash do recibo", () => {
  const report = extrairDocumentoRealTime({ bytes: pdf, url: RELATORIO_MS_URL, observedAt: "2026-09-17T00:00:00Z", registrationId: "MS-07706/2026" })
  assert.equal(report.evidence_sha256, RELATORIO_MS_SHA256)
  assert.deepEqual(report.scenarios.map((scenario) => scenario.page), [5, 7, 12])
  const changed = Buffer.from(pdf)
  changed[changed.length - 1] ^= 1
  assert.throws(() => extrairDocumentoRealTime({ bytes: changed, url: RELATORIO_MS_URL, observedAt: "now", registrationId: "MS-07706/2026" }), /recibo revisado/)
})

test("rejeita linha espontânea MS ausente, inclusive a menção de 1%", () => {
  const incomplete = layout.replace(/^\s*Reinaldo Azambuja\s+1%\s*$/m, "")
  assert.throws(() => parseTextoRealTimeMsPdf(incomplete, "MS-07706/2026"), /lista duplicada ou incompleta/)
})

test("rejeita data de calendário impossível no relatório MS", () => {
  const invalidDate = layout.replace("DIVULGAÇÃO: 06/08/2026", "DIVULGAÇÃO: 31/09/2026")
  assert.throws(() => parseTextoRealTimeMsPdf(invalidDate, "MS-07706/2026"), /datas inválidas/)
})
