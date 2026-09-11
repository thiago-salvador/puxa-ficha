import "./helpers/server-only"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { extrairDadosEstaticosFolha, selecionarDataFolha } from "../scripts/lib/pesquisas-monitoramento-folha-dados"

const dir = new URL("./fixtures/pesquisas-distribuicao/folha/", import.meta.url)
const html = (id: string) => readFileSync(new URL(`${id}.html`, dir), "utf8")
const parse = (id: string) => extrairDadosEstaticosFolha(html(id))!
const synthetic = (tsv: string) => `<span class="chart-title">Intenção de voto</span>\n<script>\ndata: ${JSON.stringify(tsv)}\n</script>`

test("título preserva entidades codificadas duas vezes", () => {
  const input = synthetic("Nome\tPercentual\nA\t60\nB\t40").replace("Intenção de voto", "&amp;quot; &amp;#39; &quot; &#39; &amp;")
  assert.equal(extrairDadosEstaticosFolha(input)?.title, "&quot; &#39; \" ' &")
})

test("capturas preservam hash HTTP e todas as células TSV literais", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"))
  for (const record of manifest.records) {
    assert.equal(createHash("sha256").update(html(record.chart_id)).digest("hex"), record.sha256)
    assert.equal(parse(record.chart_id).raw_tsv, record.raw_tsv)
  }
})

test("14 gráficos reais têm contagem literal e histórico preservados", () => {
  const expected = { Kqs5O: [14, 1], rn20B: [4, 10], yAPWC: [9, 1], pu2wZ: [7, 4], Unswb: [7, 1], iEuIx: [4, 2], "2axDg": [12, 1], LZR8o: [10, 1], GJawM: [13, 1], WyvXr: [12, 1], lhfyt: [11, 1], "1wfOs": [12, 1], tsHGm: [8, 1], VbIkx: [14, 1] }
  for (const [id, [rows, columns]] of Object.entries(expected)) {
    const data = parse(id)
    assert.equal(data.rows.length, rows, id)
    assert.ok(data.rows.every((row) => row.values.length === columns), id)
  }
})

test("nacional mantém duas linhas de zero, categorias, e seleção histórica exata", () => {
  const first = selecionarDataFolha(parse("Kqs5O"), "19.ago.2026")
  assert.deepEqual(first.results.map((row) => row.value_percent), [39, 33, 5, 4, 3, 2, 1, 1, 1, 1, 0, 0, 6, 4])
  assert.deepEqual(first.results.filter((row) => row.value_percent === 0).map((row) => row.raw_label), ["Clariana Barão  (DC)", "Hertz Dias  (PSTU)"])
  const duel = parse("rn20B")
  assert.deepEqual(selecionarDataFolha(duel, "19.ago.2026").results.map((row) => row.value_percent), [47, 43, 9, 2])
  assert.deepEqual(selecionarDataFolha(duel, "11.jun.2025").results.map((row) => row.value_percent), [47, 38, 14, 1])
  assert.throws(() => selecionarDataFolha(duel, "20.ago.2026"), /não consta/)
  assert.ok(parse("Kqs5O").gaps.includes("footnote_marker_without_note"))
})

test("datas SP e Ceará mantêm divergências e ano ausente visíveis", () => {
  const sp = parse("yAPWC")
  assert.deepEqual(sp.date_labels, ["20.ago.2026"])
  assert.match(sp.source_text, /18 e 19 de agosto de 2026/)
  assert.throws(() => selecionarDataFolha(sp, "19.ago.2026"), /não consta/)
  const ce = parse("iEuIx")
  assert.equal(ce.orientation, "dates_in_rows")
  assert.ok(ce.gaps.includes("year_not_in_table"))
  assert.deepEqual(selecionarDataFolha(ce, "12.ago").results.map((row) => row.value_percent), [55, 37, 5, 3])
  assert.throws(() => selecionarDataFolha(parse("2axDg"), "20.ago.2026"), /não consta/)
})

test("sem tabela, script executável, colunas inválidas e duplicações falham fechados", () => {
  assert.equal(extrairDadosEstaticosFolha('<h1>Lula 39%; Flávio 33%</h1>'), null)
  assert.equal(extrairDadosEstaticosFolha('<script>\ndata: "Nome\\tData" + runRemote()\n</script>'), null)
  assert.throws(() => extrairDadosEstaticosFolha(synthetic("Nome\t19.ago.2026\nA\t50\t1\nB\t50")), /colunas/)
  assert.throws(() => extrairDadosEstaticosFolha(synthetic("Nome\t19.ago.2026\t19.ago.2026\nA\t50\t51\nB\t50\t49")), /datas duplicadas/)
  assert.throws(() => extrairDadosEstaticosFolha(synthetic("A\t50\nA\t50")), /duplicados/)
  assert.throws(() => extrairDadosEstaticosFolha(synthetic("A\t101\nB\t0")), /intervalo/)
  assert.throws(() => extrairDadosEstaticosFolha(synthetic("A\t50\nB\t50") + synthetic("A\t50\nB\t50")), /ambíguas/)
})

test("célula ausente conserva sinal e não vira zero", () => {
  const data = extrairDadosEstaticosFolha(synthetic("Nome\t19.ago.2026\nA\t0\nB\t-\nOutros\t"))!
  assert.deepEqual(data.rows.map((row) => row.values[0].value_percent), [0, null, null])
  assert.deepEqual(data.rows.map((row) => row.values[0].raw_value), ["0", "-", ""])
  assert.ok(data.gaps.includes("missing_published_cells"))
})
