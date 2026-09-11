import "./helpers/server-only"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"
import { avaliarEvidenciaAoVivo, listarAlvosMonitoramento, obterContratoFonte, resultadoFalhaColeta, escreverRelatorios } from "../scripts/lib/pesquisas-monitoramento"
import { construirCoberturaDescoberta } from "../scripts/lib/pesquisas-monitoramento-descoberta"
import { extrairDocumentoPoderData } from "../scripts/lib/pesquisas-monitoramento-poderdata-pdf"
import { extrairDocumentoRealTime, RELATORIO_PARANA_URL } from "../scripts/lib/pesquisas-monitoramento-realtime-pdf"
import { coletarComplementos } from "../scripts/lib/pesquisas-monitoramento-complementos"
import { aplicarOperacoesAgendadas, carregarCatalogosAgendados, CATALOGOS_PERMITIDOS, consolidarPropostasAgendadas, validarDocumentoDiffAgendado } from "../scripts/pesquisas-atualizacao-agendada/model"
import { parsePesquisasEleitoraisJson } from "../src/lib/pesquisas-eleitorais"

test("recibos reais: extratores, CLI, operações parciais, aplicação e parser público", { skip: !process.env.PESQUISAS_I1_RECEIPTS || !process.env.PESQUISAS_I2_DOCUMENTS }, async () => {
  const receipts = process.env.PESQUISAS_I1_RECEIPTS!
  const pdfRoot = process.env.PESQUISAS_I2_DOCUMENTS!
  const work = mkdtempSync(resolve(tmpdir(), "pf-i4-replay-"))
  const read = (file: string) => JSON.parse(readFileSync(file, "utf8"))
  const sourceHashes = CATALOGOS_PERMITIDOS.map((file) => createHash("sha256").update(readFileSync(file)).digest("hex"))
  const matrix = read(resolve(receipts, "pesquisas-monitoramento-matrix-34360285171/matrix.json"))
  const outcomes: Array<{ id: string; registration_id: string; original_eligible: boolean; decision: ReturnType<typeof avaliarEvidenciaAoVivo>["decision"]; diagnostic?: ReturnType<typeof avaliarEvidenciaAoVivo>["diagnostic"]; responses: number; unresolved_labels: string[]; identity_proofs: unknown[]; complementary_blockers: unknown[] }> = []
  const documents = []
  const pdfEvidence = []
  const i4 = read(resolve(".artifacts/pesquisas-distribuicao/I4/proposal.json"))
  let preservedI4 = 0
  for (const directory of readdirSync(receipts).filter((name) => name.startsWith("pesquisas-monitoramento-part-"))) {
    const base = resolve(receipts, directory)
    const before = read(resolve(base, "proposal.json"))
    const discovered = read(resolve(base, "discovered-targets.json"))
    const registry = read(resolve(base, "tse-observations.json"))
    const previousDocuments = read(resolve(base, "document-observations.json"))
    const attempts = read(resolve(base, "source-attempts.json"))
    const results = []
    for (const item of before.items) {
      const id = item.id.replace(/-live$/, "")
      const original = [...listarAlvosMonitoramento(), ...discovered.targets].find((target) => target.poll_id === id)
      assert.ok(original, id)
      const target = { ...original, url: attempts.find((entry: { poll_id: string }) => entry.poll_id === id)?.selected_url ?? original.url }
      const html = readFileSync(resolve(base, "source-html", `${id}.html.txt`), "utf8")
      const registrySupplement = registry.find((entry: { registry: { registration_id: string } }) => entry.registry.registration_id === target.registration_id)
      let resultDocument = previousDocuments.find((entry: { registration_id: string }) => entry.registration_id === target.registration_id)
      const pdf = ({ "BR-04974/2026": ["agosto", "https://static.poder360.com.br/uploads/2026/08/Relatorio-PoderData-Eleitoral-26ago26-1.pdf"], "BR-07845/2026": ["julho", "https://static.poder360.com.br/uploads/2026/07/Relatorio-PoderData-Eleitoral-29jul26-3.pdf"], "BR-07561/2026": ["setembro", "https://static.poder360.com.br/uploads/2026/09/Relatorio-PoderData-Eleitoral-2set26.pdf"] } as Record<string, string[]>)[target.registration_id]
      const observedAt = item.evidence?.observed_at ?? item.diagnostic.source_observed_at
      if (pdf) resultDocument = extrairDocumentoPoderData({ bytes: readFileSync(resolve(pdfRoot, `poderdata-${pdf[0]}.pdf`)), url: pdf[1], observedAt, registrationId: target.registration_id, publicationDate: registrySupplement?.publication_date })
      if (target.registration_id === "PR-09262/2026") resultDocument = extrairDocumentoRealTime({ bytes: readFileSync(resolve(pdfRoot, "realtime-parana.pdf")), url: RELATORIO_PARANA_URL, observedAt, registrationId: target.registration_id })
      if (resultDocument) pdfEvidence.push({ registration_id: target.registration_id, sha256: resultDocument.evidence_sha256, scenarios: resultDocument.scenarios.length })
      let result
      try { result = avaliarEvidenciaAoVivo({ target, source: obterContratoFonte(target.source_id), html, observedAt, registry: registry.map((entry: { registry: never }) => entry.registry), registrySupplement, resultDocument }) }
      catch (error) { result = resultadoFalhaColeta({ detail: String(error), source_url: target.url, source_observed_at: observedAt, source_sha256: createHash("sha256").update(html).digest("hex") }) }
      const rows = (evidence: typeof result.evidence) => evidence ? [evidence, ...(evidence.additional_scenarios ?? [])].flatMap((scenario) => scenario.results.map((row) => [row.raw_label, row.value_percent])) : []
      if (item.decision.eligible_for_human_review) {
        assert.equal(result.decision.eligible_for_human_review, true, id)
        assert.deepEqual(rows(result.evidence), rows(item.evidence), id)
      }
      const prior = i4.items.find((entry: { id: string }) => entry.id === item.id)
      if (prior?.decision.eligible_for_human_review) {
        preservedI4++
        assert.equal(result.decision.eligible_for_human_review, true, `I4 preserved: ${id}`)
        assert.deepEqual(rows(result.evidence), rows(prior.evidence), `I4 values: ${id}`)
      }
      // No network in this replay. HTML-only diagnostic exercises the same RS persistence path.
      const complements = target.source_id === "real-time-big-data-estaduais-2026" ? await coletarComplementos({ target, html, observedAt }) : []
      outcomes.push({ id, registration_id: target.registration_id, original_eligible: item.decision.eligible_for_human_review, decision: result.decision, diagnostic: result.diagnostic, responses: rows(result.evidence).length, unresolved_labels: [...new Set([result.evidence, ...(result.evidence?.additional_scenarios ?? [])].flatMap((scenario) => scenario?.results.filter((row) => row.match_status === "indeterminado").map((row) => row.raw_label) ?? []))], identity_proofs: result.evidence?.identity_observations ?? [], complementary_blockers: complements.flatMap((item) => item.data && "blockers" in item.data ? item.data.blockers : []) })
      results.push({ case_id: item.id, result })
    }
    const output = resolve(work, "parts", directory)
    escreverRelatorios(results, output)
    documents.push({ key: directory.replace("pesquisas-monitoramento-part-", ""), proposal: read(resolve(output, "proposal.json")) })
  }
  assert.equal(outcomes.length, 24)
  assert.equal(preservedI4, 6)
  assert.equal(outcomes.filter((row) => row.original_eligible).length, 5)
  const eligible = outcomes.filter((row) => row.decision.eligible_for_human_review)
  assert.equal(eligible.length, 7)
  assert.equal(eligible.reduce((sum, row) => sum + row.responses, 0), 182)
  writeFileSync(resolve(work, "matrix.json"), JSON.stringify(matrix))
  writeFileSync(resolve(work, "discovery.json"), JSON.stringify({ status: "partial", coverage: construirCoberturaDescoberta({ observations: [], targets: listarAlvosMonitoramento() }) }))
  const cli = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", "scripts/pesquisas-atualizacao-agendada/cli.ts", "consolidate", "--matrix", resolve(work, "matrix.json"), "--input", resolve(work, "parts"), "--discovery", resolve(work, "discovery.json"), "--out", resolve(work, "consolidated")], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: resolve(work, "github-output"), GITHUB_STEP_SUMMARY: resolve(work, "github-summary") } })
  assert.equal(cli.status, 1, cli.stderr)
  const status = read(resolve(work, "consolidated/status.json"))
  assert.equal(status.operation_status, "candidates")
  assert.equal(status.status, "blocked")
  assert.equal(status.promotion.authorized, false)
  assert.equal(status.poll_alerts.length, 17)
  const diff = validarDocumentoDiffAgendado(read(resolve(work, "consolidated/diff.json")))
  assert.equal(diff.operations.length, 7)
  const corrupted = structuredClone(documents)
  const reviewedItem = corrupted.flatMap((document) => document.proposal.items).find((item) => item.id.includes("ba-01568"))
  assert.ok(reviewedItem)
  reviewedItem.normalized_contract.identity_aliases.find((alias: { proof: { basis: string } }) => alias.proof.basis === "reviewed_documentary_bridge").proof.source_sha256 = "d".repeat(64)
  const rejected = consolidarPropostasAgendadas({ matrix: matrix.include, documents: corrupted, catalogs: carregarCatalogosAgendados() })
  assert.equal(rejected.diff.operations.length, 6, "altered documentary proof must not produce a Bahia operation")
  const catalogRoot = resolve(work, "copy")
  mkdirSync(resolve(catalogRoot, "scripts/data"), { recursive: true })
  CATALOGOS_PERMITIDOS.forEach((file) => writeFileSync(resolve(catalogRoot, file), readFileSync(file)))
  aplicarOperacoesAgendadas(diff.operations, catalogRoot)
  const once = CATALOGOS_PERMITIDOS.map((file) => readFileSync(resolve(catalogRoot, file), "utf8"))
  aplicarOperacoesAgendadas(diff.operations, catalogRoot)
  assert.deepEqual(CATALOGOS_PERMITIDOS.map((file) => readFileSync(resolve(catalogRoot, file), "utf8")), once)
  const catalogs = carregarCatalogosAgendados(catalogRoot)
  const sources = [readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8"), readFileSync("scripts/data/pesquisas-governadores-fontes.json", "utf8")]
  const parsed = [parsePesquisasEleitoraisJson(JSON.stringify(catalogs.presidente), sources[0]), ...catalogs.governadores.datasets.map((dataset) => parsePesquisasEleitoraisJson(JSON.stringify(dataset), sources[1]))]
  const allPolls = [catalogs.presidente.pesquisas, ...catalogs.governadores.datasets.map((dataset) => dataset.pesquisas)].flat()
  for (const operation of diff.operations) {
    const poll = allPolls.find((poll) => poll.id === operation.poll_id)!
    assert.deepEqual(poll.cenarios.map((scenario) => scenario.resultados), operation.proposed.cenarios.map((scenario) => scenario.resultados))
    assert.equal(poll.state, "indeterminado")
  }
  assert.equal(consolidarPropostasAgendadas({ matrix: matrix.include, documents, catalogs }).diff.operations.length, 0)
  assert.deepEqual(CATALOGOS_PERMITIDOS.map((file) => createHash("sha256").update(readFileSync(file)).digest("hex")), sourceHashes)
  const rollbackRoot = resolve(work, "rollback-copy")
  mkdirSync(resolve(rollbackRoot, "scripts/data"), { recursive: true })
  CATALOGOS_PERMITIDOS.forEach((file) => copyFileSync(resolve(catalogRoot, file), resolve(rollbackRoot, file)))
  // Simulate restoring the two pre-publication snapshots in a separate copy.
  CATALOGOS_PERMITIDOS.forEach((file) => copyFileSync(file, resolve(rollbackRoot, file)))
  assert.deepEqual(CATALOGOS_PERMITIDOS.map((file) => createHash("sha256").update(readFileSync(resolve(rollbackRoot, file))).digest("hex")), sourceHashes)
  const output = resolve(".artifacts/pesquisas-distribuicao/R2")
  mkdirSync(output, { recursive: true })
  for (const name of ["proposal.json", "diff.json", "coverage.json", "status.json", "summary.md"]) copyFileSync(resolve(work, "consolidated", name), resolve(output, name))
  const r1 = read(resolve(".artifacts/pesquisas-distribuicao/R1/evidencias.json"))
  const cases = r1.records.map((record: { poll_id: string; lacuna_restante: string; evidencia_nova: { url: string; sha256: string } }) => {
    const outcome = outcomes.find((row) => row.id === record.poll_id)
    assert.ok(outcome, `R1 case accounted: ${record.poll_id}`)
    return { poll_id: record.poll_id, status: outcome.decision.eligible_for_human_review ? "resolvido" : "excecao_explicita", reason: outcome.decision.reason, diagnostic: outcome.diagnostic ?? null, unresolved_labels: outcome.unresolved_labels, identity_proofs: outcome.identity_proofs, r1_url: record.evidencia_nova.url, r1_reported_sha256: record.evidencia_nova.sha256, r1_gap: record.lacuna_restante }
  })
  assert.equal(cases.length, 18)
  assert.equal(cases.filter((row: { status: string }) => row.status === "resolvido").length, 1)
  writeFileSync(resolve(output, "casos.json"), JSON.stringify(cases, null, 2))
  writeFileSync(resolve(output, "replay.json"), JSON.stringify({ method: "Reexecução local dos recibos 34360285171; sem consulta atual à rede ou publicação", work, status, operations: diff.operations.map((operation) => operation.poll_id), outcomes, pdfEvidence, public_visible_operation_ids: diff.operations.filter((op) => parsed.some((dataset) => dataset.pesquisas.some((poll) => poll.id === op.poll_id))).map((op) => op.poll_id), catalog_hashes_unchanged: sourceHashes }, null, 2))
  console.log(`R2_REPLAY_PASS: ${eligible.length} pesquisas, 182 respostas, 17 exceções, 7 operações em cópia; ${work}`)
})
