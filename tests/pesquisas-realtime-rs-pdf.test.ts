import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  extrairDocumentoRealTime,
  parseTextoRealTimeRsPdf,
  RELATORIO_RS_SHA256,
  RELATORIO_RS_URL,
} from "../scripts/lib/pesquisas-monitoramento-realtime-pdf"

const fixtureRoot = "tests/fixtures/pesquisas-distribuicao/documentos"
const layout = readFileSync(`${fixtureRoot}/realtime-rs.layout.txt`, "utf8")
const pdf = readFileSync(`${fixtureRoot}/realtime-rs.pdf`)

test("extrai o RS-09640/2026 com cinco cenários e perguntas preservadas", () => {
  const report = parseTextoRealTimeRsPdf(layout, "RS-09640/2026")
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
    registration_id: "RS-09640/2026",
    geography_code: "RS",
    office: "Governador",
    publication_date: "2026-08-25",
    fieldwork: { start: "2026-08-20", end: "2026-08-24" },
    sample_size: 1600,
    margin_error_pp: 2,
    confidence_percent: 95,
  })
  assert.deepEqual(report.scenarios.map((scenario) => ({ label: scenario.label, page: scenario.page, question: scenario.question })), [
    { label: "Primeiro turno espontâneo", page: 5, question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO RIO GRANDE DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)" },
    { label: "Primeiro turno estimulado", page: 7, question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO RIO GRANDE DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA SE OS NOMES FOSSEM ESTES?" },
    { label: "Juliana Brizola x Zucco", page: 12, question: null },
    { label: "Zucco x Gabriel Souza", page: 13, question: null },
    { label: "Juliana Brizola x Gabriel Souza", page: 14, question: null },
  ])
  assert.equal(report.scenarios[0].results.find((row) => row.raw_label === "Eduardo Leite")?.value_percent, 1)
  for (const scenario of report.scenarios) assert.equal(scenario.results.reduce((sum, row) => sum + row.value_percent, 0), 100)
})

test("extrai o PDF nominal e exige o hash do recibo", () => {
  const report = extrairDocumentoRealTime({ bytes: pdf, url: RELATORIO_RS_URL, observedAt: "2026-09-17T00:00:00Z", registrationId: "RS-09640/2026" })
  assert.equal(report.evidence_sha256, RELATORIO_RS_SHA256)
  assert.deepEqual(report.scenarios.map((scenario) => scenario.page), [5, 7, 12, 13, 14])
  const changed = Buffer.from(pdf)
  changed[changed.length - 1] ^= 1
  assert.throws(() => extrairDocumentoRealTime({ bytes: changed, url: RELATORIO_RS_URL, observedAt: "now", registrationId: "RS-09640/2026" }), /recibo revisado/)
})

test("rejeita layout RS incompleto", () => {
  const incomplete = layout.replace(/^\s*Eduardo Leite\s+1%\s*$/m, "")
  assert.throws(() => parseTextoRealTimeRsPdf(incomplete, "RS-09640/2026"), /lista duplicada ou incompleta|candidatos ausentes/)
})

test("rejeita percentual ausente em linha de baixo valor", () => {
  const incomplete = layout.replace(/(Eduardo Leite)\s+1%/, "$1")
  assert.throws(() => parseTextoRealTimeRsPdf(incomplete, "RS-09640/2026"), /linha de resposta não reconhecida|lista duplicada ou incompleta/)
})

test("rejeita data de calendário impossível", () => {
  const invalidDate = layout.replace("DIVULGAÇÃO: 25/08/2026", "DIVULGAÇÃO: 31/09/2026")
  assert.throws(() => parseTextoRealTimeRsPdf(invalidDate, "RS-09640/2026"), /datas inválidas/)
})
