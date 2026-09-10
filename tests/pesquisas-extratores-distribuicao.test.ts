import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parseTextoPoderData } from "../scripts/lib/pesquisas-monitoramento-poderdata-pdf"
import { extrairPublicacaoRealTime, inspecionarPublicacaoRealTime } from "../scripts/lib/pesquisas-monitoramento-realtime-cenarios"
import { extrairDadosEstaticosFolha } from "../scripts/lib/pesquisas-monitoramento-folha-dados"
import { parseTextoRealTimePdf } from "../scripts/lib/pesquisas-monitoramento-realtime-pdf"

const root = "tests/fixtures/pesquisas-distribuicao/documentos/"
const fixture = (name: string, file = "entrada.html") => readFileSync(`tests/fixtures/pesquisas-distribuicao/${name}/${file}`, "utf8")
type Expected = { cenarios: Array<{ turno: number; resultados_explicitamente_publicados: Array<{ rotulo: string; percentual: number }> }> }
const oracle = (name: string) => JSON.parse(fixture(name, "expected.json")) as Expected
const literal = (expected: Expected) => expected.cenarios.map((scenario) => scenario.resultados_explicitamente_publicados.map((row) => ({ raw_label: row.rotulo, value_percent: row.percentual })))
const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
const pdfText = (name: string, raw = false) => readFileSync(`${root}${name}.${raw ? "raw" : "layout"}.txt`, "utf8")
const august = () => parseTextoPoderData(pdfText("poderdata-agosto"), "BR-04974/2026", "2026-08-27", pdfText("poderdata-agosto", true))

test("agosto: lista independente do gráfico concilia 15 respostas com Total; cinco cenários e 31 respostas", () => {
  assert.throws(() => parseTextoPoderData(pdfText("poderdata-agosto"), "BR-04974/2026", "2026-08-27"), /gráfico sem tabela/)
  const result = august()
  assert.deepEqual(result.scenarios.map((s) => [s.turn, s.page, s.results.length]), [[1, 6, 15], [2, 16, 4], [2, 17, 4], [2, 18, 4], [2, 19, 4]])
  assert.deepEqual(result.scenarios[0].results.map((r) => r.raw_label), ["Lula", "Flávio Bolsonaro", "Renan Santos", "Ronaldo Caiado", "Escritor Augusto Cury", "Pablo Marçal", "Zema", "Hertz Dias", "Samara", "Edmilson Costa", "Clariana Barão", "Rui Costa Pimenta", "Veterinário Wilson Grassi", "Branco/Nulo", "Não sabe"])
  assert.deepEqual(result.scenarios.map((s) => s.results.map((r) => r.value_percent)), [[38, 35, 4, 4, 4, 3, 2, 2, 1, 1, 0, 0, 0, 5, 2], [44, 45, 9, 2], [37, 44, 16, 3], [43, 44, 10, 2], [44, 43, 10, 2]])
  assert.deepEqual(result.scenarios[0].history?.map((column) => column.date), ["2026-08-12", "2026-08-26"])
  assert.ok(result.scenarios.every((s) => s.results_date === "2026-08-26"))
})

test("agosto: remoção de zero, troca temporal, valor divergente e rótulo desconhecido não usam Total como preenchimento", () => {
  const text = pdfText("poderdata-agosto"), raw = pdfText("poderdata-agosto", true)
  const pages = raw.split("\f")
  for (const changed of [pages[5].replace("Veterinário Wilson Grassi\n", ""), pages[5].replace("12/ago\n26/ago", "26/ago\n12/ago"), pages[5].replace("\n38\n35\n", "\n39\n35\n"), pages[5].replace("Samara\n", "Outra pessoa\n"), pages[5].replace("\n0\n0\n0\n5\n2\n", "\n0\n0\n5\n2\n")]) {
    assert.notEqual(changed, pages[5])
    assert.throws(() => parseTextoPoderData(text, "BR-04974/2026", "2026-08-27", pages.map((p, i) => i === 5 ? changed : p).join("\f")))
  }
  const changedTotal = text.replace(/(Lula\s+36%\s+41%\s+)38%/, "$139%")
  assert.notEqual(changedTotal, text)
  assert.throws(() => parseTextoPoderData(changedTotal, "BR-04974/2026", "2026-08-27", raw), /diverge da coluna Total/)
})

test("setembro real reproduz todos os rótulos e percentuais do oráculo L3, inclusive zero", () => {
  const result = parseTextoPoderData(pdfText("poderdata-setembro"), "BR-07561/2026", "2026-09-03")
  assert.deepEqual(result.scenarios.map((s) => s.results), literal(oracle("poderdata-setembro-zero")))
  const text = pdfText("poderdata-setembro")
  const missingZero = text.replace(/^.*Veterinário Wilson Grassi\s+0%\s+0%\s+0%\s*\n/m, "")
  assert.notEqual(missingZero, text)
  assert.throws(() => parseTextoPoderData(missingZero, "BR-07561/2026", "2026-09-03"), /diverge da coluna Total/)
})

test("recortes negativos L3 não se tornam relatórios válidos com ficha técnica ou tabelas inventadas", () => {
  for (const name of ["negative-linha-omitida", "negative-zero-omitido", "negative-troca-coluna-temporal"]) assert.throws(() => parseTextoPoderData(fixture(name, "entrada.txt"), "BR-07561/2026", "2026-09-03"))
  assert.throws(() => parseTextoPoderData(fixture("poderdata-grafico-sem-tabela"), "BR-04974/2026"))
})

test("julho mantém os 24 valores do relatório anteriormente elegível", () => {
  const result = parseTextoPoderData(pdfText("poderdata-julho"), "BR-07845/2026")
  assert.deepEqual(result.scenarios.map((s) => s.results.map((r) => r.value_percent)), [[35, 41, 4, 5, 3, 3, 5, 4], [43, 46, 9, 2], [37, 45, 15, 4], [42, 44, 10, 3], [43, 44, 10, 3]])
})

test("MS mantém as 19 respostas L3 em espontânea, estimulada e duelo sem resolver identidade", () => {
  const result = inspecionarPublicacaoRealTime(fixture("realtime-ms-multicenario"), plain)!
  assert.deepEqual(result.scenarios.map((s) => s.results), literal(oracle("realtime-ms-multicenario")))
  assert.deepEqual(result.scenarios.map((s) => [s.turn, s.mode]), [[1, "espontaneo"], [1, "estimulado"], [2, "estimulado"]])
  assert.deepEqual(result.blockers, [])
  assert.ok(result.scenarios.every((s) => s.results.every((r) => !Object.hasOwn(r, "candidate_id"))))
})

test("RS conserva 19 respostas L3 e títulos conflitantes; entrada estrita continua bloqueada", () => {
  const html = fixture("realtime-rs-conflitante")
  const result = inspecionarPublicacaoRealTime(html, plain)!
  assert.deepEqual(result.scenarios.map((s) => s.results), literal(oracle("realtime-rs-conflitante")))
  assert.equal(result.blockers.filter((b) => b.code === "metadata_conflict").length, 3)
  assert.throws(() => extrairPublicacaoRealTime(html, plain), /nomes conflitantes/)
})

test("Real Time: controles L3 não aprovam mistura de cargos, título conflitante, nota ausente ou manchete", () => {
  assert.throws(() => extrairPublicacaoRealTime(fixture("negative-mistura-senado-governador"), plain))
  // This L3 mutation removes both note and asterisk. Its oracle, not the
  // unmarked category Outros, declares that a grouping note is required.
  const missingNote = fixture("negative-nota-outros-ausente")
  for (const html of [missingNote, missingNote + "<p>* Margem de erro de 2 pontos.</p>", missingNote + "<p>*C e D somados atingem 2%.</p>"]) assert.throws(() => extrairPublicacaoRealTime(html, plain, { groupingNotesRequired: [0] }), /nota de agrupamento/)
  for (const name of ["negative-titulo-conflitante", "realtime-html-missing-turn"]) {
    let accepted = false
    try { accepted = extrairPublicacaoRealTime(fixture(name), plain) !== null } catch { /* Expected fail-closed result. */ }
    assert.equal(accepted, false, name)
  }
})

test("Folha: recortes L3 sem dados estáticos não usam título/meta como tabela", () => {
  for (const name of ["datafolha-html-missing-results", "datafolha-meta-conflito"]) assert.equal(extrairDadosEstaticosFolha(fixture(name)), null)
})

test("Paraná PDF: 26 respostas, cinco cenários, Outros literal e todos os duelos sem Senado/rejeição", () => {
  const result = parseTextoRealTimePdf(pdfText("realtime-parana"), "PR-09262/2026")
  assert.deepEqual(result.fieldwork, { start: "2026-08-13", end: "2026-08-17" })
  assert.equal(result.publication_date, "2026-08-18")
  assert.deepEqual(result.scenarios.map((s) => [s.turn, s.mode, s.page]), [[1, "espontaneo", 5], [1, "estimulado", 7], [2, "estimulado", 12], [2, "estimulado", 13], [2, "estimulado", 14]])
  assert.deepEqual(result.scenarios.map((s) => s.results.map((r) => r.value_percent)), [[15, 8, 6, 5, 3, 10, 53], [37, 22, 20, 2, 1, 6, 12], [55, 27, 9, 9], [45, 30, 14, 11], [33, 30, 18, 19]])
  assert.deepEqual(result.scenarios[1].notes, ["OS CANDIDATOS ADRIANO TEIXEIRA (PCO) / ALEXANDRE SALOMÃO (MOBILIZA) / SAMUEL DE MATTOS (PSTU) / TAYNÁ MIESSA (UP) SOMADOS, ATINGIRAM 1%."])
  assert.ok(result.scenarios.every((s) => s.results.every((r) => !r.raw_label.includes("ADRIANO"))))
})

test("Paraná PDF: registro, modalidade, duelos e nota de Outros ausentes bloqueiam", () => {
  const text = pdfText("realtime-parana")
  for (const changed of [text.replace("(PERGUNTA ABERTA)", ""), text.replace("SOMADOS, ATINGIRAM 1%.", ""), text.replace("SOMADOS, ATINGIRAM 1%.", "SOMADOS, ATINGIRAM 2%."), text.replace(/(Luiz França \(Missão\)\s+2)%/, "$1"), text.replace("CENÁRIO 03", "CENÁRIO 04"), text.split("\f").filter((_, i) => i !== 13).join("\f")]) {
    assert.notEqual(changed, text)
    assert.throws(() => parseTextoRealTimePdf(changed, "PR-09262/2026"))
  }
  assert.throws(() => parseTextoRealTimePdf(text, "PR-00000/2026"), /registro/)
})
