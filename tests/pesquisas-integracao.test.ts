import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"
import { executarDescobertaIntegrada, construirCoberturaDescoberta } from "../scripts/lib/pesquisas-monitoramento-descoberta"
import { criarOrcamentoDescoberta, GEOGRAFIAS_DESCOBERTA, type InventarioRegistrosPesqele } from "../scripts/lib/pesquisas-monitoramento-pesqele"
import { coletarComplementos, linksGraficosFolha } from "../scripts/lib/pesquisas-monitoramento-complementos"
import { extrairDocumentoRealTime, parseTextoRealTimePdf, RELATORIO_PARANA_URL } from "../scripts/lib/pesquisas-monitoramento-realtime-pdf"
import { listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"
import { parsePublicacaoMonitorada } from "../scripts/lib/pesquisas-monitoramento-adapters"
import { carregarCatalogosAgendados } from "../scripts/pesquisas-atualizacao-agendada/model"
import { carregarIdentidadesCuradas, resolverIdentidadeCurada } from "../scripts/lib/pesquisas-monitoramento-identidades"

test("cinco nomes pendentes exigem prova escopada; menção espontânea não força candidatura", () => {
  for (const [uf, label] of [["BA", "ACM Neto (União Brasil)"], ["BA", "Estevão (DC)"], ["MS", "Renato Gomes (DC)"], ["MS", "Reinaldo Azambuja (PL)"], ["SE", "Dr. Helton Monteiro (PSOL)"]]) {
    assert.equal(resolverIdentidadeCurada(label, carregarIdentidadesCuradas("Governador", uf), new Map()), null, `${uf}: ${label}`)
  }
})

test("descoberta integrada compartilha orçamento e conserva falha por UF, independente da fila", async () => {
  const budget = criarOrcamentoDescoberta()
  const inventory: InventarioRegistrosPesqele = { schema_version: "pesquisas-registros-v1", election: "Eleições Gerais 2026", date_from: "2026-09-01", date_to: "2026-09-09", budget: budget.snapshot(),
    geographies: GEOGRAFIAS_DESCOBERTA.map((geography_code) => ({ geography_code, status: geography_code === "AC" ? "failed" : "observed", query_exhausted: geography_code !== "AC", absence_of_poll_confirmed: false, records: [], pages: [], errors: geography_code === "AC" ? ["HTTP 403"] : [], session_restarts: 0 })) }
  const target = listarAlvosMonitoramento()[0]
  const result = await executarDescobertaIntegrada({ targets: [target], sourceId: "all", validateTargets: true, dateFrom: inventory.date_from, dateTo: inventory.date_to, budget }, {
    discover: async (input) => { assert.equal(input.budget, budget); return [] },
    inventory: async (input) => { assert.equal(input.budget, budget); assert.equal(input.dateFrom, "2026-09-01"); return inventory },
    intake: async (input) => { assert.equal(input.budget, budget); assert.equal(input.inventory, inventory); return { targets: [target], entries: [], registry: [] } },
  })
  assert.equal(result.status, "source_failure")
  assert.equal(result.queue_status, "targets_ready_for_collection")
  assert.equal(result.coverage.length, 28)
  assert.equal(result.coverage.find((row) => row.geography_code === "AC")!.registry_query_status, "failed")
  assert.ok(result.coverage.every((row) => !row.coverage_complete && !row.absence_of_poll_confirmed))
})

test("resultado conciliado não desaparece da cobertura fora da janela de registro", () => {
  const coverage = construirCoberturaDescoberta({ observations: [], targets: [], validatedResults: [{ geography_code: "AM", registration_id: "AM-09965/2026", source_sha256: "a".repeat(64), registry_sha256: "b".repeat(64), evidence_path: "proposal.json#test" }] })
  assert.equal(coverage.find((row) => row.geography_code === "AM")!.records[0].status, "result_validated")
  assert.ok(coverage.every((row) => !row.coverage_complete))
})

test("gráficos vinculados à matéria conservam células ausentes; URL externa e JavaScript não são consultados", async () => {
  const chart = '<span class="chart-title">Intenção de voto</span>\n<script>\ndata: "Nome\\t19.ago.2026\\nA\\t0\\nB\\t-"\n</script>'
  const html = '<div data-url="https://arte.folha.uol.com.br/graficos/Kqs5O/"></div><script>data-url="https://arte.folha.uol.com.br/graficos/Evil/"</script><div data-url="https://other.example/graficos/Evil/"></div>'
  assert.deepEqual(linksGraficosFolha(html), ["https://arte.folha.uol.com.br/graficos/Kqs5O/"])
  const calls: string[] = []
  const budget = criarOrcamentoDescoberta({ fetchImpl: async (url) => { calls.push(String(url)); return new Response(String(url).endsWith("robots.txt") ? "User-agent: *\nAllow: /" : chart) } })
  const target = listarAlvosMonitoramento({ sourceId: "datafolha-folha-globo-nacional-2026" })[0]
  const [result] = await coletarComplementos({ target, html, observedAt: "2026-09-09T00:00:00Z", budget })
  assert.equal(calls.length, 2)
  assert.equal(result.status, "extracted_unreconciled")
  assert.equal(result.source_sha256, createHash("sha256").update(chart).digest("hex"))
  assert.ok(result.data && "rows" in result.data)
  assert.deepEqual(result.data.rows.map((row) => row.values[0].value_percent), [0, null])
})

test("RS persiste cenários e todos os conflitos sem autorizar o adaptador", async () => {
  const html = readFileSync("tests/fixtures/pesquisas-distribuicao/realtime-rs-conflitante/entrada.html", "utf8")
  const target = listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026", uf: "RS" })[0]
  const [result] = await coletarComplementos({ target, html, observedAt: "2026-09-09T00:00:00Z" })
  assert.equal(result.status, "blocked")
  assert.ok(result.data && "blockers" in result.data)
  assert.equal(result.data.blockers.length, 3)
  assert.equal(result.data.scenarios.flatMap((scenario) => scenario.results).length, 19)
})

test("PDF PR exige URL, formato e tamanho e concilia metadados no adaptador compartilhado", () => {
  assert.throws(() => extrairDocumentoRealTime({ bytes: Buffer.from("%PDF-invalid"), url: "https://evil.example/report.pdf", observedAt: "now", registrationId: "PR-09262/2026" }), /escopo/)
  assert.throws(() => extrairDocumentoRealTime({ bytes: new Uint8Array(8_000_001), url: RELATORIO_PARANA_URL, observedAt: "now", registrationId: "PR-09262/2026" }), /tamanho/)
  const document = { ...parseTextoRealTimePdf(readFileSync("tests/fixtures/pesquisas-distribuicao/documentos/realtime-parana.layout.txt", "utf8"), "PR-09262/2026"), kind: "realtime_pdf" as const, url: RELATORIO_PARANA_URL, observed_at: "2026-09-09T00:00:00Z", evidence_sha256: "a".repeat(64) }
  const target = listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026", uf: "PR" })[0]
  const html = '<meta property="article:published_time" content="2026-08-18T12:00:00Z"><article>Real Time Big Data: governo do Paraná. PR-09262/2026. Pesquisa com campo de 13 a 17 de agosto de 2026. Foram ouvidos 1.600 eleitores. Margem de erro de 2 pontos. Nível de confiança de 95%. Entrevistas presenciais.</article>'
  const evidence = parsePublicacaoMonitorada({ target, source: obterContratoFonte(target.source_id), html, observedAt: document.observed_at, resultDocument: document })
  assert.equal(evidence.publication_complete, true)
  assert.equal(evidence.results.length + evidence.additional_scenarios!.flatMap((scenario) => scenario.results).length, 26)
  assert.match(evidence.scenario.label, /Estimulada/)
  assert.equal(evidence.results.find((row) => row.raw_label === "Outros")!.value_percent, 1)
  assert.equal(evidence.results.find((row) => row.raw_label === "NS / NR")!.match_status, "not_candidate")
  assert.ok(evidence.result_notes?.some((note) => note.includes("SOMADOS")))
  assert.throws(() => parsePublicacaoMonitorada({ target, source: obterContratoFonte(target.source_id), html, observedAt: document.observed_at, resultDocument: { ...document, sample_size: 1601 } }), /metadados conflitantes/)
})

test("CLI grava operações parciais e descoberta ausente, mas sai com falha e promoção falsa", () => {
  const root = mkdtempSync(resolve(tmpdir(), "pf-i4-cli-"))
  try {
    const poll = structuredClone(carregarCatalogosAgendados().presidente.pesquisas[0])
    poll.sample.size.value += 1
    const scenarios = poll.cenarios.map((scenario) => ({ scenario_complete: true, scenario: { id: scenario.id, turn: scenario.turn, geography: scenario.geography }, results: structuredClone(scenario.resultados) }))
    mkdirSync(resolve(root, "parts/fixture"), { recursive: true })
    writeFileSync(resolve(root, "parts/fixture/proposal.json"), JSON.stringify({ schema_version: "1.0.0", dry_run: true, human_review_required: true, generated_at: "2026-09-09T00:00:00Z", items: [{ id: `${poll.id}-live`, normalized_contract: poll, decision: { classification: "novo", eligible_for_human_review: true, reason: "approved_new_evidence" }, evidence: { publication_complete: true, ...scenarios[0], additional_scenarios: scenarios.slice(1) } }] }))
    writeFileSync(resolve(root, "matrix.json"), JSON.stringify({ include: [{ key: "fixture", source_id: poll.source_id, uf: "BR", poll_ids: [poll.id] }] }))
    const result = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", "scripts/pesquisas-atualizacao-agendada/cli.ts", "consolidate", "--input", resolve(root, "parts"), "--matrix", resolve(root, "matrix.json"), "--out", resolve(root, "out")], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: resolve(root, "outputs"), GITHUB_STEP_SUMMARY: resolve(root, "summary") } })
    assert.equal(result.status, 1, result.stderr)
    const status = JSON.parse(readFileSync(resolve(root, "out/status.json"), "utf8"))
    assert.equal(status.operation_status, "candidates")
    assert.equal(status.coverage.status, "partial")
    assert.equal(status.promotion.authorized, false)
    assert.match(status.coverage.alerts.join(" "), /manifesto de descoberta ausente/)
    assert.equal(JSON.parse(readFileSync(resolve(root, "out/diff.json"), "utf8")).operations.length, 1)
    assert.match(readFileSync(resolve(root, "outputs"), "utf8"), /promotion_authorized=false/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
