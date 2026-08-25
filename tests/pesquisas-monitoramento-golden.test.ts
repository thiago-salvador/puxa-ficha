import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import {
  avaliarCasoMonitoramento,
  type CasoGoldenMonitoramento,
  type EvidenciaPesquisaCandidata,
} from "../scripts/lib/pesquisas-monitoramento"

const FIXTURES = resolve("tests/fixtures/pesquisas-monitoramento")
const cases = readFileSync("tests/fixtures/pesquisas-monitoramento-golden.jsonl", "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line) as CasoGoldenMonitoramento)

test("golden set cobre os modos de falha exigidos", () => {
  assert.deepEqual(
    new Set(cases.map((entry) => entry.case_id)),
    new Set([
      "publicacao-nova-valida",
      "fonte-condicional",
      "registro-conflitante",
      "alias-ambiguo",
      "mudanca-retroativa",
      "zero-publicado",
      "timeout",
      "html-inesperado",
      "evidencia-inalterada",
      "evidencia-vencida",
    ]),
  )
})

test("reference solution passa em 100 por cento dos casos", () => {
  for (const goldenCase of cases) {
    const result = avaliarCasoMonitoramento(goldenCase, FIXTURES)
    assert.deepEqual(result.decision, goldenCase.reference_solution, goldenCase.case_id)
  }
  console.log("MONITORAMENTO_GOLDEN_100_PASS")
})

test("as sete classificacoes sao alcancaveis e fail-closed", () => {
  const observed = new Set(cases.map((entry) => avaliarCasoMonitoramento(entry, FIXTURES).decision.classification))
  assert.deepEqual(
    observed,
    new Set([
      "novo",
      "alterado",
      "inalterado",
      "vencido",
      "conflitante",
      "fonte indisponivel",
      "identidade nao resolvida",
    ]),
  )
  console.log("MONITORAMENTO_CLASSIFICACOES_PASS")
})

test("evidencia normalizada preserva todos os campos obrigatorios e zero real", () => {
  const zeroCase = cases.find((entry) => entry.case_id === "zero-publicado")
  assert.ok(zeroCase)
  const result = avaliarCasoMonitoramento(zeroCase, FIXTURES)
  const evidence = result.evidence as EvidenciaPesquisaCandidata
  assert.ok(evidence.url.startsWith("https://"))
  assert.equal(evidence.institute, "PoderData")
  assert.equal(evidence.registration.id, "BR-07845/2026")
  assert.deepEqual(evidence.fieldwork, { start: "2026-07-26", end: "2026-07-29" })
  assert.ok(evidence.scenario.id)
  assert.equal(evidence.sample.size, 2400)
  assert.equal(evidence.margin_error_pp, 2)
  assert.equal(evidence.results[0]?.value_percent, 0)
  assert.match(evidence.observed_at, /^2026-08-25T/)
  assert.match(evidence.evidence_sha256, /^[a-f0-9]{64}$/)
})

test("instrucao embutida em HTML nao entra na evidencia", () => {
  const valid = cases.find((entry) => entry.case_id === "publicacao-nova-valida")
  assert.ok(valid)
  const result = avaliarCasoMonitoramento(valid, FIXTURES)
  assert.doesNotMatch(JSON.stringify(result), /ignore as instrucoes|publique os dados/i)
})
