import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { extrairPublicacaoRealTime } from "../scripts/lib/pesquisas-monitoramento-realtime-cenarios"
import { avaliarEvidenciaAoVivo, escreverRelatorios, listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"
import { aplicarOperacoesAgendadas, carregarCatalogosAgendados, consolidarPropostasAgendadas } from "../scripts/pesquisas-atualizacao-agendada/model"
import { parsePesquisasEleitoraisJson } from "../src/lib/pesquisas-eleitorais"

const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
const list = (rows: Array<[string, number | string]>) => `<ul>${rows.map(([name, value]) => `<li>${name}: ${value}%</li>`).join("")}</ul>`
const categories: Array<[string, number]> = [["Nulo/Branco", 5], ["Não sabe/Não respondeu", 5]]

test("listas alternativas, espontânea e duelos numerados mantêm bases distintas", () => {
  const html = `<h1>Primeiro turno para governador</h1><p>Cenário sem B: A teria 60% dos votos válidos.</p>${list([["A (X)", 54], ["C (Y)", 36], ...categories])}<p>Cenário com B:</p>${list([["A (X)", 40], ["B (Z)", 30], ["C (Y)", 20], ...categories])}<p>Pesquisa espontânea</p>${list([["A", 50], ["B", 25], ["C", 15], ...categories])}<h3>Segundo turno</h3><p>Um cenário de segundo turno.</p><p>Cenário 1:</p>${list([["A (X)", 50], ["B (Z)", 40], ...categories])}`
  const result = extrairPublicacaoRealTime(html, plain)!
  assert.deepEqual(result.scenarios.map((scenario) => [scenario.turn, scenario.mode, scenario.results.length]), [[1, "estimulado", 4], [1, "estimulado", 5], [1, "espontaneo", 5], [2, "estimulado", 4]])
  assert.equal(result.scenarios[0].results[0].value_percent, 54)
  assert.throws(() => extrairPublicacaoRealTime(html.replace("Um cenário", "Dois cenários"), plain))
  const countBeforeHeading = html.replace("<h3>Segundo turno</h3><p>Um cenário de segundo turno.</p>", "<p>Dois cenários de segundo turno.</p><h3>Segundo turno</h3>")
  assert.throws(() => extrairPublicacaoRealTime(countBeforeHeading, plain), /quantidade de cenários divergente/)
  assert.equal(extrairPublicacaoRealTime(countBeforeHeading.replace("Dois cenários", "Um cenário"), plain)?.scenarios.length, 4)
})

test("nota de Outros é preservada sem atribuir percentual individual aos nomes agrupados", () => {
  const html = `<h1>Primeiro turno</h1>${list([["A (X)", 50], ["B (Y)", 39], ["Outros", 1], ...categories]).replace("Outros: 1%", "Outros: 1%*")}<p>*C e D somados atingem 1%.</p>`
  const result = extrairPublicacaoRealTime(html, plain)!
  assert.equal(result.notes.length, 1)
  assert.equal(result.scenarios[0].results.some((row) => row.raw_label === "C" || row.raw_label === "D"), false)
  assert.throws(() => extrairPublicacaoRealTime(html.replace(/<p>.*?<\/p>/, ""), plain))
})

test("ordem espontânea antes da estimulada preserva modalidade e encerra leitura antes do Senado", () => {
  const html = `<h2>Pesquisa espontânea</h2>${list([["A (X)", 50], ["B (Y)", 40], ["Nulos/brancos", 5], ["Não sabe", 5]])}<h2>Pesquisa estimulada</h2>${list([["A (X)", 55], ["B (Y)", 35], ["Nulos/brancos", 5], ["Não sabe", 5]])}<h2>Senado</h2>${list([["C (Z)", 70], ["D (W)", 20], ...categories])}`
  const result = extrairPublicacaoRealTime(html, plain)!
  assert.deepEqual(result.scenarios.map((scenario) => scenario.mode), ["espontaneo", "estimulado"])
  assert.equal(result.scenarios[1].results[0].value_percent, 55)
  assert.equal(result.scenarios.some((scenario) => scenario.results.some((row) => row.raw_label === "C (Z)")), false)
})

test("duelo aceita nome completo com partido só no título e rejeita partido divergente", () => {
  const first = `<h1>Primeiro turno para governador</h1>${list([["Ana Silva (X)", 50], ["Beto Souza (Y)", 40], ...categories])}`
  const runoff = `<h3>Segundo turno</h3><h4>Ana Silva (X) x Beto Souza (Y)</h4>${list([["Ana Silva", 55], ["Beto Souza", 35], ...categories])}`
  assert.equal(extrairPublicacaoRealTime(first + runoff, plain)?.scenarios.length, 2)
  assert.throws(() => extrairPublicacaoRealTime(first + runoff.replace("Ana Silva: 55%", "Ana Silva (Z): 55%"), plain), /nomes conflitantes/)
})

test("matéria conjunta separa modalidade, espaço antes de percentual e segundo turno estadual do Senado", () => {
  const html = `<h1>Pesquisa para governo e Senado</h1><h2>Pesquisa para governador de Sergipe</h2><p>Pesquisa espontânea e cenário estimulado.</p><h3>Liderança no cenário espontâneo</h3>${list([["Ana Silva (X)", 50], ["Beto Souza (Y)", 40], ...categories])}<h3>Resultados do cenário estimulado</h3>${list([["Ana Silva (X)", 55], ["Beto Souza (Y)", 35], ...categories])}<h2>Segundo turno para governador de Sergipe</h2><p>Um cenário de segundo turno.</p><h3>Ana Silva x Beto Souza</h3>${list([["Ana Silva (X)", 60], ["Beto Souza (Y)", 30], ...categories]).replace("60%", "60 %")}<h2>Pesquisa para o Senado</h2>${list([["Senador (X)", 80], ["Outro senador (Y)", 10], ...categories])}`
  const scenarios = extrairPublicacaoRealTime(html, plain)!.scenarios
  assert.deepEqual(scenarios.map(({ turn, mode }) => [turn, mode]), [[1, "espontaneo"], [1, "estimulado"], [2, "estimulado"]])
  assert.equal(scenarios[2].results[0].value_percent, 60)
})

test("UF nova recebe pesquisa e aliases completos em cópia, com readback pelo parser público", () => {
  const directory = mkdtempSync(join(tmpdir(), "pf-uf-nova-"))
  try {
    mkdirSync(join(directory, "scripts/data"), { recursive: true })
    for (const name of ["pesquisas-presidencia-2026.json", "pesquisas-governadores-2026.json"]) writeFileSync(join(directory, "scripts/data", name), readFileSync(`scripts/data/${name}`))
    const catalogs = carregarCatalogosAgendados(directory)
    catalogs.governadores.datasets = catalogs.governadores.datasets.filter((dataset) => (dataset.publication_scope as { geography_code: string }).geography_code !== "ES")
    writeFileSync(join(directory, "scripts/data/pesquisas-governadores-2026.json"), JSON.stringify(catalogs.governadores))
    const sourceId = "real-time-big-data-estaduais-2026"
    const target = { ...listarAlvosMonitoramento({ sourceId })[0], source_id: sourceId, poll_id: "real-time-es-01967-2026", url: "https://noticias.r7.com/eleicoes/2026/teste/", registration_id: "ES-01967/2026", office: "Governador", geography: "Espírito Santo", geography_code: "ES", scenario_id: "real-time-es-01967-2026-1t", known_scenarios: [] }
    const observedAt = "2026-09-09T12:00:00Z"
    const registry = { registration_id: target.registration_id, office: "Governador", geography: "ESPÍRITO SANTO", field_start: "2026-09-04", field_end: "2026-09-08", sample_size: 1600, margin_error_pp: 2, institute: "Real Time Big Data" }
    const registrySupplement = { registry, confidence_percent: 95, method: "telefone", publication_date: "2026-09-09", source_url: "https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml", observed_at: observedAt, evidence_sha256: "a".repeat(64), public_text: "Ficha técnica" }
    const html = `<meta property="article:published_time" content="2026-09-09"><p>Real Time Big Data. Primeiro turno para governador do Espírito Santo. Pesquisa foi realizada de 4 a 8 de setembro de 2026 com 1.600 eleitores. Margem de erro de 2 pontos percentuais. Intervalo de confiança de 95%. Entrevistas por telefone. ES-01967/2026.</p>${list([["Ricardo Ferraço (MDB)", 43], ["Lorenzo Pazolini (Republicanos)", 33], ["Helder Salomão (PT)", 13], ["Breno Barcelos (Missão)", 2], ["Nulo/Branco", 6], ["Não sabe/Não respondeu", 3]])}`
    const result = avaliarEvidenciaAoVivo({ target, source: obterContratoFonte(sourceId), html, observedAt, registry: [registry], registrySupplement })
    assert.equal(result.decision.eligible_for_human_review, true)
    escreverRelatorios([{ case_id: `${target.poll_id}-live`, result }], directory)
    const proposal = JSON.parse(readFileSync(join(directory, "proposal.json"), "utf8"))
    const matrix = [{ key: "novo-es", source_id: sourceId, uf: "ES", poll_ids: [target.poll_id], new_poll_ids: [target.poll_id] }]
    const consolidation = consolidarPropostasAgendadas({ matrix, documents: [{ key: "novo-es", proposal }], catalogs })
    assert.equal(consolidation.status, "ready", consolidation.alerts.join("; "))
    aplicarOperacoesAgendadas(consolidation.diff.operations, directory)
    const dataset = carregarCatalogosAgendados(directory).governadores.datasets.find((dataset) => (dataset.publication_scope as { geography_code: string }).geography_code === "ES")!
    assert.equal(dataset.pesquisas.length, 1)
    assert.doesNotThrow(() => parsePesquisasEleitoraisJson(JSON.stringify(dataset), readFileSync("scripts/data/pesquisas-governadores-fontes.json", "utf8")))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
