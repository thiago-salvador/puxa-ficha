import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import type { ContratoPesquisaAgendada, DocumentoColetadoAgendado, ItemMatrizAgendada, ItemPropostaAgendada } from "../scripts/pesquisas-atualizacao-agendada/model"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const {
  aplicarOperacoesAgendadas, carregarCatalogosAgendados, CATALOGOS_PERMITIDOS,
  consolidarPropostasAgendadas, executarPromocaoAgendada,
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

test("lote misto conserva operação inteira e bloqueio local, sem promover", async () => {
  const input = fixture()
  const result = consolidarPropostasAgendadas(input)
  assert.equal(result.status, "blocked")
  assert.equal(result.operation_status, "candidates")
  assert.equal(result.diff.operations.length, 1)
  assert.deepEqual(result.diff.operations[0].proposed.cenarios, input.documents[0].proposal.items[0].normalized_contract!.cenarios)
  assert.equal(result.poll_alerts.length, 1)
  assert.match(result.summary, /identity_unresolved/)
  assert.equal(result.coverage.status, "partial")
  assert.equal(result.promotion.authorized, false)
  const never = async () => { assert.fail("promoção não pode ser chamada") }
  assert.equal((await executarPromocaoAgendada(result, { existingDraft: never, apply: never, hasChanges: never, verify: never, createBranch: never, commit: never, push: never, createDraftPr: never })).status, "blocked")
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

test("descoberta incompleta não apaga operação nem declara sucesso global", () => {
  const input = fixture()
  input.documents[0].proposal.items.pop()
  input.matrix[0].poll_ids.pop()
  const result = consolidarPropostasAgendadas({ ...input, discovery: { status: "partial", alerts: ["matéria sem registro identificável"] } })
  assert.equal(result.diff.operations.length, 1)
  assert.equal(result.status, "blocked")
  assert.equal(result.coverage.status, "partial")
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
  assert.equal(result.promotion.authorized, false)
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
  assert.equal(ready.promotion.authorized, false)
  const never = async () => { assert.fail("ready sem autorização não pode iniciar promoção") }
  assert.equal((await executarPromocaoAgendada(ready, { existingDraft: never, apply: never, hasChanges: never, verify: never, createBranch: never, commit: never, push: never, createDraftPr: never })).status, "blocked")
  input.documents[0].proposal.items[0] = eligible(input.catalogs.presidente.pesquisas[0])
  const unchanged = consolidarPropostasAgendadas(input)
  assert.equal(unchanged.status, "no_changes")
  assert.equal(unchanged.operation_status, "no_changes")
  assert.equal(unchanged.diff.operations.length, 0)
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
  assert.equal(result.status, "blocked")
  assert.equal(result.promotion.authorized, false)
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
