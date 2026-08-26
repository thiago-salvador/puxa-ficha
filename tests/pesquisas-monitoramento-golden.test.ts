import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

import type {
  CasoGoldenMonitoramento,
  EvidenciaPesquisaCandidata,
} from "../scripts/lib/pesquisas-monitoramento"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never
const {
  avaliarCasoMonitoramento,
  escreverRelatorios,
  listarAlvosMonitoramento,
  listarFontesAprovadasUtilizadas,
} = require("../scripts/lib/pesquisas-monitoramento") as typeof import("../scripts/lib/pesquisas-monitoramento")

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
      "sucesso-datafolha-nacional",
      "sucesso-datafolha-estadual",
      "sucesso-real-time-big-data-estadual",
      "fonte-condicional",
      "registro-conflitante",
      "instituto-conflitante-tse",
      "alias-ambiguo",
      "mudanca-retroativa",
      "zero-publicado",
      "timeout",
      "html-inesperado",
      "layout-alterado-datafolha",
      "evidencia-inalterada",
      "evidencia-vencida",
    ]),
  )
})

test("inventario calcula quatro adaptadores e 18 combinacoes aprovadas", () => {
  assert.deepEqual(listarFontesAprovadasUtilizadas(), [
    "datafolha-folha-globo-estaduais-2026",
    "datafolha-folha-globo-nacional-2026",
    "poderdata-aya-nacional-2026",
    "real-time-big-data-estaduais-2026",
  ])
  assert.equal(listarAlvosMonitoramento().length, 18)
  assert.equal(listarAlvosMonitoramento({ sourceId: "datafolha-folha-globo-estaduais-2026" }).length, 7)
  assert.equal(listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026" }).length, 9)
  assert.equal(listarAlvosMonitoramento({ uf: "CE" }).length, 1)
  assert.equal(listarAlvosMonitoramento({ uf: "BR" }).length, 2)
  assert.throws(() => listarAlvosMonitoramento({ sourceId: "quaest-genial-nacional-2026" }), /sem adaptador aprovado/)
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

test("cada adaptador extrai o contrato completo da fixture sanitizada", () => {
  const successIds = [
    "publicacao-nova-valida",
    "sucesso-datafolha-nacional",
    "sucesso-datafolha-estadual",
    "sucesso-real-time-big-data-estadual",
  ]
  for (const caseId of successIds) {
    const goldenCase = cases.find((entry) => entry.case_id === caseId)
    assert.ok(goldenCase)
    const evidence = avaliarCasoMonitoramento(goldenCase, FIXTURES).evidence
    assert.ok(evidence, caseId)
    assert.equal(evidence.source_status, "aprovado", caseId)
    assert.match(evidence.url, /^https:\/\//, caseId)
    assert.ok(evidence.institute, caseId)
    assert.match(evidence.registration.id, /^(?:BR|[A-Z]{2})-\d{5}\/2026$/, caseId)
    assert.ok(evidence.scenario.office, caseId)
    assert.match(evidence.scenario.geography_code, /^(?:BR|[A-Z]{2})$/, caseId)
    assert.equal(evidence.scenario.turn, 1, caseId)
    assert.ok(evidence.scenario.label, caseId)
    assert.match(evidence.fieldwork.start, /^2026-\d{2}-\d{2}$/, caseId)
    assert.match(evidence.fieldwork.end, /^2026-\d{2}-\d{2}$/, caseId)
    assert.ok(evidence.sample.size > 0, caseId)
    assert.ok(evidence.margin_error_pp > 0, caseId)
    assert.ok(evidence.results.length >= 2, caseId)
    assert.match(evidence.observed_at, /^2026-08-/, caseId)
    assert.match(evidence.evidence_sha256, /^[a-f0-9]{64}$/, caseId)
  }
})

test("contrato normalizado distingue geografia nacional de unidade federativa", () => {
  const nationalCase = cases.find((entry) => entry.case_id === "sucesso-datafolha-nacional")
  const stateCase = cases.find((entry) => entry.case_id === "sucesso-datafolha-estadual")
  assert.ok(nationalCase)
  assert.ok(stateCase)

  const outputDir = mkdtempSync(join(tmpdir(), "pesquisas-monitoramento-geografia-"))
  try {
    escreverRelatorios([
      { case_id: nationalCase.case_id, result: avaliarCasoMonitoramento(nationalCase, FIXTURES) },
      { case_id: stateCase.case_id, result: avaliarCasoMonitoramento(stateCase, FIXTURES) },
    ], outputDir)
    const proposal = JSON.parse(readFileSync(join(outputDir, "proposal.json"), "utf8")) as {
      items: Array<{ normalized_contract: { geography: { type: string } } }>
    }
    assert.equal(proposal.items[0]?.normalized_contract.geography.type, "nacional")
    assert.equal(proposal.items[1]?.normalized_contract.geography.type, "unidade_federativa")
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test("instrucao embutida em HTML nao entra na evidencia", () => {
  const valid = cases.find((entry) => entry.case_id === "publicacao-nova-valida")
  assert.ok(valid)
  const result = avaliarCasoMonitoramento(valid, FIXTURES)
  assert.doesNotMatch(JSON.stringify(result), /ignore as instrucoes|publique os dados/i)
})
