import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import type { ContratoPesquisaAgendada, DocumentoColetadoAgendado, ItemMatrizAgendada, ItemPropostaAgendada } from "../scripts/pesquisas-atualizacao-agendada/model"
import { groupWeeklyPollSeries } from "../src/lib/poll-weeks"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const {
  aplicarOperacoesAgendadas, carregarCatalogosAgendados, CATALOGOS_PERMITIDOS,
  consolidarPropostasAgendadas, executarPromocaoAgendada, validarAutorizacaoPublicacaoAgendada,
} = require("../scripts/pesquisas-atualizacao-agendada/model") as typeof import("../scripts/pesquisas-atualizacao-agendada/model")
const { parsePesquisasEleitoraisJson } = require("../src/lib/pesquisas-eleitorais") as typeof import("../src/lib/pesquisas-eleitorais")

function eligible(poll: ContratoPesquisaAgendada): ItemPropostaAgendada {
  const contract = structuredClone(poll)
  delete contract.id
  const observations = contract.cenarios.map((scenario) => ({
    scenario_complete: true,
    scenario: { id: scenario.id, turn: scenario.turn, geography: scenario.geography },
    results: structuredClone(scenario.resultados),
  }))
  return {
    id: `${poll.id}-live`,
    decision: { classification: "novo", eligible_for_human_review: true, reason: "approved_new_evidence" },
    normalized_contract: contract,
    evidence: { publication_complete: true, ...observations[0], additional_scenarios: observations.slice(1) },
  }
}

function fixture() {
  const catalogs = carregarCatalogosAgendados()
  const a = structuredClone(catalogs.presidente.pesquisas[0])
  const b = structuredClone(a)
  b.id = "sintetica-independente"
  b.registration.code.value = "BR-00000/2026"
  catalogs.presidente.pesquisas.push(b)
  const updated = structuredClone(a)
  updated.sample.size.value += 1
  const valid = eligible(updated)
  const blocked = eligible(b)
  blocked.decision = { classification: "incompleto", eligible_for_human_review: false, reason: "identity_unresolved" }
  blocked.normalized_contract = null
  const matrix: ItemMatrizAgendada[] = [{ key: "fixture", source_id: a.source_id, uf: a.geography.code, poll_ids: [a.id!, b.id!] }]
  const documents: DocumentoColetadoAgendado[] = [{ key: "fixture", proposal: { schema_version: "1.0.0", dry_run: true, human_review_required: true, generated_at: "2026-09-09T00:00:00Z", items: [valid, blocked] } }]
  return { catalogs, matrix, documents }
}

function temporaryCatalogs(catalogs: ReturnType<typeof carregarCatalogosAgendados>) {
  const path = mkdtempSync(resolve(tmpdir(), "pf-i1-catalog-"))
  mkdirSync(resolve(path, "scripts/data"), { recursive: true })
  writeFileSync(resolve(path, CATALOGOS_PERMITIDOS[0]), JSON.stringify(catalogs.presidente))
  writeFileSync(resolve(path, CATALOGOS_PERMITIDOS[1]), JSON.stringify(catalogs.governadores))
  return path
}

function promotionDependencies() {
  return {
    async existingDraft() { return false },
    async apply() {},
    async hasChanges() { return true },
    async verify() {},
    async createBranch() {},
    async commit() {},
    async push() {},
    async createDraftPr() {},
  }
}

test("lote misto promove operação válida e conserva bloqueio local", async () => {
  const input = fixture()
  const result = consolidarPropostasAgendadas(input)
  assert.equal(result.status, "ready")
  assert.equal(result.operation_status, "candidates")
  assert.equal(result.diff.operations.length, 1)
  assert.deepEqual(result.diff.operations[0].proposed.cenarios, input.documents[0].proposal.items[0].normalized_contract!.cenarios)
  assert.equal(result.poll_alerts.length, 1)
  assert.match(result.summary, /identity_unresolved/)
  assert.equal(result.coverage.status, "partial")
  assert.equal(result.promotion.authorized, true)
  assert.equal(result.promotion.human_review_required, false)
  assert.equal((await executarPromocaoAgendada(result, promotionDependencies())).status, "draft_created")
})

const globalFailures: Array<[string, (input: ReturnType<typeof fixture>) => void]> = [
  ["artefato ausente", (x) => { x.documents = [] }],
  ["artefato duplicado", (x) => { x.documents.push(structuredClone(x.documents[0])) }],
  ["autorização insegura", (x) => { x.documents[0].proposal.dry_run = false }],
  ["schema incompatível", (x) => { x.documents[0].proposal.schema_version = "9" }],
  ["catálogo ambíguo fora do lote", (x) => { x.catalogs.presidente.pesquisas.push(structuredClone(x.catalogs.presidente.pesquisas.at(-1)!)) }],
  ["matriz duplicada", (x) => { x.matrix.push(structuredClone(x.matrix[0])) }],
  ["item inesperado", (x) => { x.documents[0].proposal.items[1].id = "desconhecido-live" }],
  ["item em artefato errado", (x) => { x.matrix[0].poll_ids.pop(); x.matrix.push({ ...x.matrix[0], key: "outra", poll_ids: ["sintetica-independente"] }); x.documents.push({ key: "outra", proposal: { ...x.documents[0].proposal, items: [] } }) }],
  ["registro alterado", (x) => { x.documents[0].proposal.items[0].normalized_contract!.registration.code.value = "BR-99999/2026" }],
  ["fonte não aprovada", (x) => { x.documents[0].proposal.items[0].normalized_contract!.source_status = "bloqueado" }],
  ["classificação conflitante elegível", (x) => { x.documents[0].proposal.items[0].decision.classification = "conflitante" }],
  ["dataset estadual duplicado", (x) => { x.catalogs.governadores.datasets.push({ ...x.catalogs.governadores.datasets[0], pesquisas: [] }) }],
  ["contrato estrutural corrompido", (x) => { x.documents[0].proposal.items = null as never }],
]
for (const [name, mutate] of globalFailures) test(`falha global: ${name}`, () => {
  const input = fixture()
  mutate(input)
  const result = consolidarPropostasAgendadas(input)
  assert.equal(result.status, "blocked")
  assert.equal(result.operation_status, "blocked")
  assert.ok(result.global_alerts.length)
  assert.equal(result.diff.operations.length, 0)
})

for (const mode of ["identidade", "cenário omitido", "percentual conflitante", "prova ausente", "cenário duplicado", "resposta duplicada"]) test(`atomicidade: ${mode}`, () => {
  const input = fixture()
  const item = input.documents[0].proposal.items[0]
  if (mode === "identidade") item.normalized_contract!.cenarios[0].resultados[0].match_status = "unresolved"
  if (mode === "cenário omitido") item.normalized_contract!.cenarios.pop()
  if (mode === "percentual conflitante") item.normalized_contract!.cenarios[0].resultados[0].value_percent += 1
  if (mode === "prova ausente") delete item.evidence!.publication_complete
  if (mode === "cenário duplicado") item.normalized_contract!.cenarios.push(structuredClone(item.normalized_contract!.cenarios[0]))
  if (mode === "resposta duplicada") item.normalized_contract!.cenarios[0].resultados.push(structuredClone(item.normalized_contract!.cenarios[0].resultados[0]))
  const result = consolidarPropostasAgendadas(input)
  assert.equal(result.diff.operations.length, 0)
  assert.equal(result.poll_alerts.length, 2)
})

function semFonte(item: ItemPropostaAgendada): ItemPropostaAgendada {
  const copy = structuredClone(item)
  copy.decision = { classification: "inalterado", eligible_for_human_review: false, reason: "source_unavailable" }
  copy.normalized_contract = null
  return copy
}

// #395. Medido nos agendados de 06, 07, 09 e 10/09: 18 de 18 itens descartados
// por fonte indisponível, contagem idêntica nos quatro dias, run concluindo
// success. Verde cego é pior que vermelho, porque vermelho chama atenção.
test("piso de cobertura: nenhuma fonte lida não pode concluir sucesso", () => {
  const input = fixture()
  input.documents[0].proposal.items = input.documents[0].proposal.items.map(semFonte)
  const result = consolidarPropostasAgendadas(input)

  assert.equal(result.coverage.status, "no_coverage")
  assert.equal(result.coverage.evaluated, 0)
  assert.equal(result.coverage.unavailable, 2)
  assert.equal(result.coverage.total, 2)
  assert.notEqual(result.status, "no_changes")
  assert.equal(result.status, "blocked")
  assert.equal(result.operation_status, "blocked")
  assert.equal(result.promotion.authorized, false)
  assert.ok(result.global_alerts.some((alert) => /cobertura nula/.test(alert)))
})

// Espelho da #387, e a razão de o piso ser estrito: lá UMA recheca com timeout
// derrubava o lote inteiro, inclusive cinco pesquisas aprovadas. Fonte ausente
// em parte do lote não pode virar bloqueio global.
test("piso de cobertura: fonte ausente em parte do lote não bloqueia o resto", () => {
  const input = fixture()
  input.documents[0].proposal.items[1] = semFonte(input.documents[0].proposal.items[1])
  const result = consolidarPropostasAgendadas(input)

  assert.notEqual(result.coverage.status, "no_coverage")
  assert.equal(result.coverage.evaluated, 1)
  assert.equal(result.coverage.unavailable, 1)
  assert.equal(result.status, "ready")
  assert.equal(result.diff.operations.length, 1)
  assert.ok(!result.global_alerts.some((alert) => /cobertura nula/.test(alert)))
})

test("descoberta incompleta não apaga operação nem declara sucesso global", () => {
  const input = fixture()
  input.documents[0].proposal.items.pop()
  input.matrix[0].poll_ids.pop()
  const result = consolidarPropostasAgendadas({ ...input, discovery: { status: "partial", alerts: ["matéria sem registro identificável"] } })
  assert.equal(result.diff.operations.length, 1)
  assert.equal(result.status, "ready")
  assert.equal(result.coverage.status, "partial")
  assert.equal(result.promotion.authorized, true)
  assert.match(result.summary, /matéria sem registro/)
})

function discoveredDuringCollection() {
  const input = fixture()
  const poll = input.catalogs.presidente.pesquisas.pop()!
  input.matrix[0].poll_ids.pop()
  const publicText = `Registro ${poll.registration.code.value}`
  input.documents[0].discovery = {
    targets: [{ poll_id: poll.id!, source_id: poll.source_id, geography_code: "BR", office: "Presidente", registration_id: poll.registration.code.value }] as never,
    registry: [{ registry: { registration_id: poll.registration.code.value, office: "Presidente" },
      source_url: "https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml",
      public_text: publicText, evidence_sha256: createHash("sha256").update(publicText).digest("hex") }] as never,
  }
  return input
}

test("registro validado durante coleta conserva operação vizinha sem liberar pesquisa incompleta", () => {
  const input = discoveredDuringCollection()
  const original = structuredClone(input.matrix)
  const result = consolidarPropostasAgendadas(input)
  assert.deepEqual(result.global_alerts, [])
  assert.equal(result.diff.operations.length, 1)
  assert.equal(result.poll_alerts.length, 1)
  assert.equal(result.promotion.authorized, true)
  assert.deepEqual(input.matrix, original)
})

for (const mode of ["sem recibo", "fonte", "UF", "hash", "registro ausente"]) test(`descoberta durante coleta rejeita ${mode}`, () => {
  const input = discoveredDuringCollection()
  const receipt = input.documents[0].discovery!
  if (mode === "sem recibo") delete input.documents[0].discovery
  if (mode === "fonte") receipt.targets[0].source_id = "outra-fonte"
  if (mode === "UF") receipt.targets[0].geography_code = "SP"
  if (mode === "hash") receipt.registry[0].public_text += " adulterado"
  if (mode === "registro ausente") receipt.registry = []
  const result = consolidarPropostasAgendadas(input)
  assert.equal(result.diff.operations.length, 0)
  assert.ok(result.global_alerts.length)
})

test("lote integral válido preserva ready; inalterado preserva no_changes sem comprovar cobertura", async () => {
  const input = fixture()
  input.documents[0].proposal.items.pop()
  input.matrix[0].poll_ids.pop()
  const ready = consolidarPropostasAgendadas(input)
  assert.equal(ready.status, "ready")
  assert.equal(ready.coverage.status, "not_assessed")
  assert.equal(ready.promotion.authorized, true)
  assert.equal((await executarPromocaoAgendada(ready, promotionDependencies())).status, "draft_created")
  input.documents[0].proposal.items[0] = eligible(input.catalogs.presidente.pesquisas[0])
  const unchanged = consolidarPropostasAgendadas(input)
  assert.equal(unchanged.status, "no_changes")
  assert.equal(unchanged.operation_status, "no_changes")
  assert.equal(unchanged.diff.operations.length, 0)
})

test("publicação atomizada grava estados publicados e entra na série semanal carregada", () => {
  const catalogs = carregarCatalogosAgendados()
  const poll = structuredClone(catalogs.presidente.pesquisas[0])
  const proposed = structuredClone(poll)
  proposed.sample.size.value += 1
  const input = {
    catalogs,
    matrix: [{ key: "single-poll", source_id: poll.source_id, uf: poll.geography.code, poll_ids: [poll.id!] }],
    documents: [{ key: "single-poll", proposal: { schema_version: "1.0.0", dry_run: true, human_review_required: true, generated_at: "2026-09-09T00:00:00Z", items: [eligible(proposed)] } }],
  } satisfies Parameters<typeof consolidarPropostasAgendadas>[0]
  const result = consolidarPropostasAgendadas(input)
  assert.equal(result.status, "ready")
  validarAutorizacaoPublicacaoAgendada({ status: result, proposal: result.proposal, diff: result.diff })
  const tampered = structuredClone(result.diff)
  tampered.operations[0].proposed.cenarios[0].resultados[0].value_percent += 20
  assert.throws(() => validarAutorizacaoPublicacaoAgendada({ status: result, proposal: result.proposal, diff: tampered }), /operação sem evidência completa/)
  const tamperedRegistration = structuredClone(result.diff)
  tamperedRegistration.operations[0].proposed.registration.code.value = "BR-99999/2026"
  assert.throws(() => validarAutorizacaoPublicacaoAgendada({ status: result, proposal: result.proposal, diff: tamperedRegistration }), /operação sem evidência completa/)
  const temp = temporaryCatalogs(catalogs)
  try {
    aplicarOperacoesAgendadas(result.diff.operations, temp, { publish: true, attestation: { status: result, proposal: result.proposal, diff: result.diff } })
    const readback = carregarCatalogosAgendados(temp)
    const sources = readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8")
    const parsed = parsePesquisasEleitoraisJson(JSON.stringify(readback.presidente), sources)
    const published = parsed.pesquisas.find((entry) => entry.id === poll.id)
    assert.ok(published)
    assert.equal(published.state, "publicado")
    assert.equal(published.sample.size.status, "publicado")
    assert.equal(published.cenarios[0].resultados[0].status, "publicado")
    const statePolls = parsed.pesquisas.flatMap(({ cenarios, ...entry }) => cenarios.map((scenario) => ({ ...entry, scenario })))
    assert.ok(groupWeeklyPollSeries(statePolls).some((series) => series.polls.some((entry) => entry.id === poll.id)))
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test("reexecução e retificação são idempotentes; histórico independente permanece intacto", () => {
  const input = fixture()
  const temp = temporaryCatalogs(input.catalogs)
  const result = consolidarPropostasAgendadas(input)
  aplicarOperacoesAgendadas(result.diff.operations, temp)
  const once = CATALOGOS_PERMITIDOS.map((file) => readFileSync(resolve(temp, file), "utf8"))
  aplicarOperacoesAgendadas(result.diff.operations, temp)
  assert.deepEqual(CATALOGOS_PERMITIDOS.map((file) => readFileSync(resolve(temp, file), "utf8")), once)
  const readback = carregarCatalogosAgendados(temp)
  assert.deepEqual(readback.presidente.pesquisas.slice(1), input.catalogs.presidente.pesquisas.slice(1))
  assert.equal(consolidarPropostasAgendadas({ ...input, catalogs: readback }).diff.operations.length, 0)
  const corrected = structuredClone(readback.presidente.pesquisas[0])
  corrected.sample.size.value += 1
  input.documents[0].proposal.items[0] = eligible(corrected)
  input.documents[0].proposal.items[0].decision = { classification: "alterado", eligible_for_human_review: true, reason: "retroactive_change" }
  const correction = consolidarPropostasAgendadas({ ...input, catalogs: readback })
  assert.equal(correction.diff.operations.length, 1)
  aplicarOperacoesAgendadas(correction.diff.operations, temp)
  const final = carregarCatalogosAgendados(temp)
  assert.equal(final.presidente.pesquisas.length, input.catalogs.presidente.pesquisas.length)
  assert.deepEqual(final.presidente.pesquisas.slice(1), input.catalogs.presidente.pesquisas.slice(1))
  assert.equal(consolidarPropostasAgendadas({ ...input, catalogs: final }).diff.operations.length, 0)
})

test("replay 34360285171: cinco candidatas, 19 exceções e parser público em cópia", { skip: !process.env.PESQUISAS_I1_RECEIPTS }, () => {
  const root = process.env.PESQUISAS_I1_RECEIPTS!
  const matrix = JSON.parse(readFileSync(resolve(root, "pesquisas-monitoramento-matrix-34360285171/matrix.json"), "utf8")).include as ItemMatrizAgendada[]
  const documents = readdirSync(root).filter((name) => name.startsWith("pesquisas-monitoramento-part-")).sort().map((name) => ({
    key: name.replace("pesquisas-monitoramento-part-", ""), proposal: JSON.parse(readFileSync(resolve(root, name, "proposal.json"), "utf8")),
  })) as DocumentoColetadoAgendado[]
  const catalogs = carregarCatalogosAgendados()
  const result = consolidarPropostasAgendadas({ matrix, documents, catalogs, discovery: { status: "partial", alerts: ["Descoberta de referência: matéria complementar sem registro identificável; cobertura não comprovada."] } })
  assert.equal(result.proposal.items.length, 24)
  assert.deepEqual(result.global_alerts, [])
  assert.equal(result.diff.operations.length, 5)
  assert.equal(result.poll_alerts.length, 19)
  assert.deepEqual(result.diff.operations.map((op) => `${op.poll_id}-live`).sort(), result.proposal.items.filter((item) => item.decision.eligible_for_human_review).map((item) => item.id).sort())
  assert.equal(result.status, "ready")
  assert.equal(result.promotion.authorized, true)
  const temp = temporaryCatalogs(catalogs)
  aplicarOperacoesAgendadas(result.diff.operations, temp)
  const readback = carregarCatalogosAgendados(temp)
  const presidentSources = readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8")
  const governorSources = readFileSync("scripts/data/pesquisas-governadores-fontes.json", "utf8")
  const parsed = [parsePesquisasEleitoraisJson(JSON.stringify(readback.presidente), presidentSources), ...readback.governadores.datasets.map((dataset) => parsePesquisasEleitoraisJson(JSON.stringify(dataset), governorSources))].flatMap((dataset) => dataset.pesquisas)
  for (const op of result.diff.operations) {
    const dataset = op.file === CATALOGOS_PERMITIDOS[0] ? readback.presidente : readback.governadores.datasets.find((entry) => entry.pesquisas.some((poll) => poll.id === op.poll_id))!
    const persisted = dataset.pesquisas.find((entry) => entry.id === op.poll_id)!
    assert.equal(persisted.state, "indeterminado")
    const baseline = [...catalogs.presidente.pesquisas, ...catalogs.governadores.datasets.flatMap((entry) => entry.pesquisas)].find((entry) => entry.id === op.poll_id)
    assert.deepEqual(persisted.cenarios, op.proposed.cenarios.map((scenario) => ({ ...scenario, comparability_key: baseline?.cenarios.find((entry) => entry.id === scenario.id)?.comparability_key ?? scenario.comparability_key })))
    const sources = op.file === CATALOGOS_PERMITIDOS[0] ? presidentSources : governorSources
    // The public parser validates every entry before filtering non-preferred sources.
    const invalid = structuredClone(dataset)
    invalid.pesquisas.find((entry) => entry.id === op.poll_id)!.cenarios[0].resultados[0].value_percent = "invalid" as never
    assert.throws(() => parsePesquisasEleitoraisJson(JSON.stringify(invalid), sources))
    const poll = parsed.find((entry) => entry.id === op.poll_id)
    if ((JSON.parse(sources).preferred_source_ids as string[]).includes(op.source_id)) {
      assert.ok(poll, op.poll_id)
      assert.equal(poll.state, "indeterminado")
      assert.equal(poll.cenarios.length, op.proposed.cenarios.length)
    } else {
      assert.equal(poll, undefined, "política pública de fontes preferenciais preservada")
    }
  }
  const unchangedIds = new Set(result.diff.operations.map((op) => op.poll_id))
  const flatten = (value: typeof catalogs) => [...value.presidente.pesquisas, ...value.governadores.datasets.flatMap((dataset) => dataset.pesquisas)]
  for (const poll of flatten(catalogs).filter((poll) => !unchangedIds.has(poll.id!))) assert.deepEqual(flatten(readback).find((entry) => entry.id === poll.id), poll)
  assert.equal(consolidarPropostasAgendadas({ matrix, documents, catalogs: readback }).diff.operations.length, 0)
  console.log(`I1 replay: ${temp}; parser público validou cinco pesquisas candidatas; 19 exceções preservadas.`)
})

test("curadoria parcial não derruba saúde operacional, mas falha operacional continua fail-closed", () => {
  const input = fixture()
  const partial = consolidarPropostasAgendadas({
    ...input,
    discovery: { status: "partial", alerts: ["inventário anual não comprovado"] },
  })
  assert.equal(partial.status, "ready")
  assert.equal(partial.operation_status, "candidates")
  assert.equal(partial.execution_status, "complete")
  assert.deepEqual(partial.execution_alerts, [])
  assert.match(partial.summary, /Execução operacional: complete/)

  const failed = consolidarPropostasAgendadas({
    ...input,
    discovery: { status: "partial", alerts: [] },
    executionAlerts: [{ code: "discovery_source_failure", message: "HTTP 403 sem fallback" }],
  })
  assert.equal(failed.status, "ready")
  assert.equal(failed.execution_status, "failed")
  assert.equal(failed.execution_alerts[0]?.code, "discovery_source_failure")
})

test("deriva falhas operacionais de invariantes e fontes, sem transformar curadoria em transporte", () => {
  const structural = fixture()
  structural.documents[0].proposal.items[0].id = "fora-da-matriz-live"
  const structuralResult = consolidarPropostasAgendadas(structural)
  assert.equal(structuralResult.execution_status, "failed")
  assert.ok(structuralResult.execution_alerts.some((alert) => alert.code === "matrix_invalid"))

  const source = fixture()
  source.documents[0].proposal.items[1].decision = { classification: "incompleto", eligible_for_human_review: false, reason: "source_timeout" }
  const sourceResult = consolidarPropostasAgendadas(source)
  assert.equal(sourceResult.status, "ready")
  assert.equal(sourceResult.execution_status, "failed")
  assert.equal(sourceResult.diff.operations.length, 1)
  assert.ok(sourceResult.execution_alerts.some((alert) => alert.code === "poll_source_failure"))

  const receiptFailure = fixture()
  const receiptResult = consolidarPropostasAgendadas({ ...receiptFailure, executionAlerts: [{ code: "artifact_invalid", message: `${receiptFailure.catalogs.presidente.pesquisas[0].id}: recibo source-html ausente` }] })
  assert.equal(receiptResult.status, "blocked")
  assert.equal(receiptResult.promotion.authorized, false)
  assert.deepEqual(receiptResult.diff.operations, [])

  const directSourceFailure = consolidarPropostasAgendadas({ ...fixture(), discovery: { status: "source_failure", alerts: [] } })
  assert.equal(directSourceFailure.execution_status, "failed")
  assert.ok(directSourceFailure.execution_alerts.some((alert) => alert.code === "discovery_source_failure"))

  const unknown = fixture()
  unknown.documents[0].proposal.items[1].decision = { classification: "incompleto", eligible_for_human_review: false, reason: "novo_status_desconhecido" }
  const unknownResult = consolidarPropostasAgendadas(unknown)
  assert.equal(unknownResult.execution_status, "failed")
  assert.match(unknownResult.summary, /alertas operacionais: 1/)
})
