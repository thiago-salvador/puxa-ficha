import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { carregarIdentidadesCuradas } from "../scripts/lib/pesquisas-monitoramento-identidades"
import { resolverIdentidadeRevisada } from "../scripts/lib/pesquisas-monitoramento-identidades-revisadas"
import { listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"
import { parsePublicacaoMonitorada, selecionarRegistroPublicado } from "../scripts/lib/pesquisas-monitoramento-adapters"
import { parseTextoRealTimePdf, RELATORIO_PARANA_URL } from "../scripts/lib/pesquisas-monitoramento-realtime-pdf"
import { validarEntradasDescobertas } from "../scripts/lib/pesquisas-monitoramento-entrada"
import { construirCoberturaDescoberta, type ObservacaoListagemPesquisas } from "../scripts/lib/pesquisas-monitoramento-descoberta"
import type { ObservacaoPesqele } from "../scripts/lib/pesquisas-monitoramento-pesqele"
import type { ClienteHttpMonitoramento } from "../scripts/lib/pesquisas-monitoramento-rede"

test("pontes documentais limitam pessoa, partido, cargo, UF, registro e hash", () => {
  const base = listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026" })[0]
  for (const [uf, registration_id, label, slug] of [
    ["BA", "BA-01568/2026", "ACM Neto (União Brasil)", "acm-neto"],
    ["BA", "BA-01568/2026", "Estevão (DC)", "jose-estevao"],
    ["MS", "MS-07706/2026", "Renato Gomes (DC)", "renato-gomes"],
  ]) {
    const target = { ...base, geography_code: uf, registration_id }
    const candidates = carregarIdentidadesCuradas("Governador", uf)
    assert.equal(resolverIdentidadeRevisada(target, label, candidates)?.slug, slug)
    for (const change of [{ office: "Senador" }, { geography_code: "PR" }, { registration_id: "BA-00000/2026" }, { source_id: "unapproved" }]) {
      assert.equal(resolverIdentidadeRevisada({ ...target, ...change }, label, candidates), null)
    }
    assert.equal(resolverIdentidadeRevisada(target, label.replace(/\(.+\)/, "(PT)"), candidates), null)
    assert.equal(resolverIdentidadeRevisada(target, label, candidates.map((c) => ({ ...c, hash: "a".repeat(64) }))), null)
    assert.equal(resolverIdentidadeRevisada(target, label, [...candidates, ...candidates]), null)
  }
  for (const [uf, label] of [["MS", "Reinaldo Azambuja (PL)"], ["PR", "Ratinho Júnior"], ["SE", "Dr. Helton Monteiro (PSOL)"]]) {
    assert.equal(resolverIdentidadeRevisada({ ...base, geography_code: uf }, label), null)
  }
})

test("provas revisadas continuam presentes nos documentos oficiais locais", () => {
  for (const [slug, literal] of [["renato-gomes", "RENATO GOMES"], ["jose-estevao", "ESTEVÃO"]]) {
    const record = JSON.parse(readFileSync(`src/data/programas-governo/governadores-2026/${slug}.json`, "utf8"))
    assert.equal(record.estado, "aprovado")
    assert.ok(record.documentos[0].extracao.secoes[0].conteudo.includes(literal))
  }
  const parties = JSON.parse(readFileSync("data/referencia-tse-partidos-2026-08-14.json", "utf8"))
  assert.ok(parties.partidos.some((p: { sigla: string; nome: string; legenda: number }) => p.sigla === "UNIÃO" && p.nome === "UNIÃO BRASIL" && p.legenda === 44))
})

const stamp = "2026-09-09T00:00:00Z"
const root = "https://www1.folha.uol.com.br/poder/2026/08/"
const observation = (count = 1): ObservacaoListagemPesquisas[] => [{ id: "folha-poder", url: root, observed_at: stamp, status: "observed", evidence_sha256: "a".repeat(64), error: null,
  links: Array.from({ length: count }, (_, i) => ({ url: `${root}datafolha-pernambuco-${i}.shtml`, title: "Datafolha governo de Pernambuco", listing_id: "folha-poder", geography_hint: "PE", office_hint: "Governador", state: "pending_validation" })) }]
const official: ObservacaoPesqele = { registry: { registration_id: "PE-01528/2026", office: "Governador", geography: "PERNAMBUCO", field_start: "2026-08-18", field_end: "2026-08-21", sample_size: 1204, margin_error_pp: 3, institute: "Datafolha" }, confidence_percent: 95, method: "presencial", publication_date: "2026-08-22", source_url: "https://pesqele-divulgacao.tse.jus.br/", observed_at: stamp, evidence_sha256: "b".repeat(64), public_text: "Fixture sintética para descoberta; não aprova datas ou resultados." }
function client(body: string, calls: string[] = []): ClienteHttpMonitoramento {
  return { getText: async (url) => { calls.push(url); return { body, status: 200, observedAt: stamp } }, getBytes: async () => { throw new Error("unused") }, postForm: async () => { throw new Error("unused") } }
}

test("registros estadual e nacional: ordem não importa; ambiguidades não são resolvidas", async () => {
  for (const ids of [["BR-00109/2026", "PE-01528/2026"], ["PE-01528/2026", "BR-00109/2026"]]) {
    assert.equal(selecionarRegistroPublicado(ids, "Governador", "PE"), "PE-01528/2026")
    const result = await validarEntradasDescobertas({ observations: observation(), knownTargets: [], client: client(ids.join(" ")), queryRegistry: async (id) => { assert.equal(id, official.registry.registration_id); return official } })
    assert.equal(result.targets.length, 1)
    assert.deepEqual(result.entries[0].published_registration_ids, ids)
    assert.equal(result.entries[0].status, "target_validated")
    assert.ok(construirCoberturaDescoberta({ observations: observation(), targets: result.targets, entries: result.entries }).every((row) => !row.coverage_complete))
  }
  for (const ids of [["PE-01528/2026", "PE-00001/2026"], ["PE-01528/2026", "SP-00001/2026"], ["BR-00109/2026", "BR-00001/2026"]]) {
    assert.equal(selecionarRegistroPublicado(ids, "Governador", "PE"), null)
    const result = await validarEntradasDescobertas({ observations: observation(), knownTargets: [], client: client(ids.join(" ")), queryRegistry: async () => { throw new Error("must not query") } })
    assert.equal(result.targets.length, 0)
    assert.equal(result.entries[0].classification, "discovery_exception")
  }
  const wrong = await validarEntradasDescobertas({ observations: observation(), knownTargets: [], client: client("PE-01528/2026 BR-00109/2026"), queryRegistry: async () => ({ ...official, registry: { ...official.registry, office: "Senador" } }) })
  assert.equal(wrong.targets.length, 0)
  assert.match(wrong.entries[0].reason, /cargo/)
})

test("teto de entrada preserva resultados parciais e diagnóstico das URLs não consultadas", async () => {
  const calls: string[] = []
  const result = await validarEntradasDescobertas({ observations: observation(101), knownTargets: [], client: client("PE-01528/2026 BR-00109/2026", calls), queryRegistry: async () => official })
  assert.equal(calls.length, 100)
  assert.equal(result.targets.length, 1)
  assert.equal(result.entries.length, 101)
  assert.equal(result.entries[100].status, "blocked")
  assert.match(result.entries[100].reason, /limite de 100/)
  const coverage = construirCoberturaDescoberta({ observations: observation(101), targets: result.targets, entries: result.entries })
  assert.equal(coverage.length, 28)
  assert.equal(coverage.find((row) => row.geography_code === "PE")?.coverage_status, "gap_or_failure")
})

test("extração compartilha desambiguação; registro nacional anterior não toma o lugar do estadual", () => {
  const target = listarAlvosMonitoramento({ sourceId: "real-time-big-data-estaduais-2026", uf: "PR" })[0]
  const document = { ...parseTextoRealTimePdf(readFileSync("tests/fixtures/pesquisas-distribuicao/documentos/realtime-parana.layout.txt", "utf8"), "PR-09262/2026"), kind: "realtime_pdf" as const, url: RELATORIO_PARANA_URL, observed_at: stamp, evidence_sha256: "a".repeat(64) }
  const html = '<meta property="article:published_time" content="2026-08-18T12:00:00Z"><article>Real Time Big Data: governo do Paraná. PR-09262/2026. Pesquisa com campo de 13 a 17 de agosto de 2026. Foram ouvidos 1.600 eleitores. Margem de erro de 2 pontos. Nível de confiança de 95%. Entrevistas presenciais.</article>'
  const parse = (body: string) => parsePublicacaoMonitorada({ target, source: obterContratoFonte(target.source_id), html: body, observedAt: stamp, resultDocument: document })
  const before = parse(html)
  const after = parse(html.replace("PR-09262/2026", "BR-00001/2026 e PR-09262/2026"))
  assert.deepEqual(after.fieldwork, before.fieldwork)
  assert.deepEqual(after.results, before.results)
  assert.deepEqual(after.additional_scenarios, before.additional_scenarios)
  assert.equal(after.registration.id, before.registration.id)
  assert.throws(() => parse(html.replace("PR-09262/2026", "PR-00001/2026 e PR-09262/2026")), /registros conflitantes/)
  assert.throws(() => parse(html.replace("PR-09262/2026", "BR-00001/2026")), /registro conflitante/)
})
