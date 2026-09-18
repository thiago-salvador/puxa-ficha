import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { parseTextoPoderData } from "../scripts/lib/pesquisas-monitoramento-poderdata-pdf"

// Literal PDF pages 1, 2, 6, 7, 16–19; removed pages remain empty to preserve numbering.
const layout = readFileSync("tests/fixtures/pesquisas-distribuicao/documentos/poderdata-br06868.layout.txt", "utf8")
const raw = readFileSync("tests/fixtures/pesquisas-distribuicao/documentos/poderdata-br06868.raw.txt", "utf8")
const parse = (text = layout, rawText = raw) => parseTextoPoderData(text, "BR-06868/2026", "2026-08-13", rawText)
const changePage6 = (fn: (page: string) => string) => raw.split("\f").map((page, index) => index === 5 ? fn(page) : page).join("\f")

test("BR-06868 extrai uma série literal e reconcilia os 15 resultados com Total", () => {
  const result = parse()
  assert.deepEqual(result.fieldwork, { start: "2026-08-09", end: "2026-08-12" })
  assert.deepEqual(result.scenarios.map((scenario) => [scenario.turn, scenario.page, scenario.results.length]), [[1, 6, 15], [2, 16, 4], [2, 17, 4], [2, 18, 4], [2, 19, 4]])
  assert.equal(result.scenarios[0].history?.length, 1)
  assert.equal(result.scenarios[0].results_date, "2026-08-12")
  assert.deepEqual(result.scenarios[0].results.find((row) => row.raw_label === "Branco ou nulo"), { raw_label: "Branco ou nulo", value_percent: 4 })
  assert.equal(result.scenarios[0].results.find((row) => row.raw_label === "Leonardo Avalanche")?.value_percent, 1)
})

test("série única rejeita data ausente, inválida, futura, repetida ou com células ausentes", () => {
  for (const changed of [
    changePage6((page) => page.replace("12/ago", "")),
    changePage6((page) => page.replace("12/ago", "32/ago")),
    changePage6((page) => page.replace("12/ago", "13/ago")),
    changePage6((page) => page.replace("12/ago", "12/ago\n12/ago")),
    changePage6((page) => page.replace("12/ago", "11/ago\n12/ago\n13/ago")),
    changePage6((page) => page.replace("\n41\n", "\n")),
    changePage6((page) => page.replace("\nLula\n", "\nFlávio Bolsonaro\n")),
  ]) assert.throws(() => parse(layout, changed))
})

test("Total independente continua bloqueando percentual ou categoria divergentes", () => {
  assert.throws(() => parse(layout, changePage6((page) => page.replace("\n41\n", "\n42\n"))), /diverge da coluna Total/)
  assert.throws(() => parse(layout, changePage6((page) => page.replace("Branco ou nulo", "Outro candidato"))), /diverge da coluna Total/)
})

test("adaptador mantém categorias literais com ou e espaços na barra", async () => {
  const { parsePublicacaoMonitorada } = await import("../scripts/lib/pesquisas-monitoramento-adapters")
  const { obterContratoFonte } = await import("../scripts/lib/pesquisas-monitoramento")
  const source = obterContratoFonte("poderdata-aya-nacional-2026")
  const target = { poll_id: "poderdata-br-06868-2026", source_id: source.id, url: "https://www.poder360.com.br/poderdata/teste/", registration_id: "BR-06868/2026", registry_url: "https://pesqele-divulgacao.tse.jus.br/", office: "Presidente", geography: "Brasil", geography_code: "BR", turn: 1 as const, scenario_id: "principal", scenario_label: "Intenção de voto no 1º turno", scenario_question: null, population: "eleitores" }
  const html = '<meta property="article:published_time" content="2026-08-13"><p>PoderData. Eleição para presidente do Brasil no primeiro turno. Pesquisa foi realizada de 9 a 12 de agosto de 2026 com 2.400 eleitores. Margem de erro de 2 pontos percentuais. Intervalo de confiança de 95%. Entrevistas por telefone. BR-06868/2026.</p>'
  for (const label of ["Branco ou nulo", "Nulo / Branco", "Não sabe / Não respondeu (NS/NR)", "Pessoa / Outra"]) {
    const document = parse()
    document.scenarios[0].results.find((row) => row.raw_label === "Branco ou nulo")!.raw_label = label
    const result = parsePublicacaoMonitorada({ source, target, html, observedAt: "2026-08-13T12:00:00Z", resultDocument: { ...document, url: "https://static.poder360.com.br/uploads/2026/08/report.pdf", observed_at: "2026-08-13T12:00:00Z", evidence_sha256: "a".repeat(64) } })
    assert.equal(result.results.find((row) => row.raw_label === label)?.match_status, label === "Pessoa / Outra" ? "indeterminado" : "not_candidate")
  }
})
