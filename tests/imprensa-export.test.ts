import assert from "node:assert/strict"
import test from "node:test"
import type { ImprensaDataset } from "@/lib/imprensa-data"
import {
  buildImprensaLongRows,
  neutralizeCsvFormula,
  serializeImprensaCsv,
  serializeImprensaJson,
  serializeImprensaLongCsv,
  IMPRENSA_AVISO,
  exportHeaders,
} from "@/lib/imprensa-export"

function dataset(): ImprensaDataset {
  return {
    version: "2",
    generatedAt: "2026-09-22T12:00:00.000Z",
    filters: { cargo: "Deputado Federal", uf: "SP" },
    availableCargos: ["Deputado Federal"],
    availableUfs: ["SP"],
    rows: [{
      slug: "joao-da-silva",
      nome: "João, Silva\nJúnior",
      nomeOriginal: "João, Silva\nJúnior",
      cargo: "Deputado Federal",
      uf: "SP",
      partido: "ABC",
      fichaUrl: "/candidato/joao-da-silva",
      sites: {
        estado: "publicado",
        quantidade: 1,
        fonteUrl: "https://tse.jus.br/recurso",
        fonteSha256: "a".repeat(64),
        coletadoEm: "2026-09-20",
        ocorrencias: [{ ordem: 1, url: "https://example.org/a?x=1" }],
      },
      chapa: {
        estado: "sem_dado",
        suplentesEstado: "nao_aplicavel",
        viceNome: null,
        viceNomeOriginal: null,
        suplentes: [],
        fonteUrl: null,
        fonteSha256: null,
        snapshotEm: null,
      },
      processos: {
        estado: "cobertura_parcial",
        buscaEstado: "contraditorio",
        quantidade: null,
        ocorrencias: [{ numero: "1", tipo: "civil", tribunal: "TJ", urlFonte: "https://tribunal.example/processo/1", fonteNivel: "oficial", dataInicio: "2020-01-01", dataDecisao: null }],
      },
      patrimonio: { estado: "publicado", ano: 2026, total: 0, valorEstado: "sem_bens_declarados", anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026" },
      gastos: {
        estado: "publicado",
        ultimoAno: 2025,
        ultimoAnoTotal: 1234.5,
        anosEmRevisao: [2024],
        anos: [
          { ano: 2025, casa: "camara", total: 1234.5, fonteUrl: "https://www.camara.leg.br/cotas/Ano-2025.csv.zip" },
          { ano: 2023, casa: "senado", total: 99, fonteUrl: null },
        ],
      },
      tcu: { estado: "nao_verificado", registros: null, consultadoEm: null, fonteUrl: null },
      sancoes: { estado: "vazio-confirmado", quantidade: 0, consultadoEm: "2026-09-20T10:00:00.000Z", fonteUrl: "https://api.portaldatransparencia.gov.br/api-de-dados/ceis" },
    }],
  }
}

test("CSV preserva UTF-8, quebras, separadores e neutraliza fórmulas", () => {
  const csv = serializeImprensaCsv(dataset())
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.ok(csv.startsWith(`\ufeff"version","generated_at","cargo_filtro","uf_filtro"`))
  assert.match(csv, /"version","generated_at","cargo_filtro","uf_filtro".*"aviso"/)
  assert.match(csv, /"2","2026-09-22T12:00:00\.000Z","Deputado Federal","SP"[\s\S]*"Confira os dados na fonte original antes de publicar\."/)
  assert.match(csv, /"João, Silva\nJúnior"/)
  for (const dangerous of ["=SUM(A1)", "+SUM(A1)", "-SUM(A1)", "@SUM(A1)"]) {
    assert.equal(neutralizeCsvFormula(dangerous), `'${dangerous}`)
  }
  for (const dangerous of ["\t=SUM(A1)", "\n=SUM(A1)", "\r=SUM(A1)", " =SUM(A1)"]) {
    assert.equal(neutralizeCsvFormula(dangerous), `'${dangerous}`)
  }
  assert.match(csv, /sites_quantidade/)
  assert.match(csv, /processos_busca_estado/)
  assert.match(csv, /chapa_estado/)
  const avisoHeader = exportHeaders("text/csv", "test.csv", dataset()).get("X-Aviso-Dados")
  assert.ok(avisoHeader)
  assert.match(avisoHeader, /^[\x00-\x7F]+$/)
  assert.equal(decodeURIComponent(avisoHeader), IMPRENSA_AVISO)
})

test("JSON mantém filtros, data e distinção null/zero", () => {
  const value = dataset()
  value.rows[0].chapa.snapshotEm = "2026-09-26T00:00:00.000Z"
  const parsed = JSON.parse(serializeImprensaJson(value))
  assert.deepEqual(parsed.filters, { cargo: "Deputado Federal", uf: "SP" })
  assert.equal(parsed.generatedAt, "2026-09-22T12:00:00.000Z")
  assert.equal(parsed.aviso, IMPRENSA_AVISO)
  assert.equal(parsed.rows[0].processos.quantidade, null)
  assert.equal(parsed.rows[0].chapa.snapshotEm, "2026-09-26T00:00:00.000Z")
  assert.match(parsed.rows[0].chapa.snapshotEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.equal("ocorrencias" in parsed.rows[0].sites, false)
  assert.equal("ocorrencias" in parsed.rows[0].processos, false)
  assert.deepEqual(parsed.rows[0].chapa, {
    estado: "sem_dado",
    suplentesEstado: "nao_aplicavel",
    viceNome: null,
    viceNomeOriginal: null,
    viceSituacao: null,
    suplentes: [],
    fonteUrl: null,
    fonteSha256: null,
    snapshotEm: "2026-09-26T00:00:00.000Z",
  })
  assert.equal(parsed.rows[0].processos.quantidadeEmConfirmacao, 0)
})

test("longos publicam as linhas da ficha, com o nível da fonte, e barram URL fora do formato", () => {
  const value = dataset()
  assert.match(serializeImprensaLongCsv(value, "sites"), /"version","generated_at","cargo_filtro","uf_filtro","slug".*"aviso"/)
  assert.ok(serializeImprensaLongCsv(value, "sites").startsWith(`\ufeff"version","generated_at"`))
  assert.match(serializeImprensaLongCsv(value, "sites"), /"2","2026-09-22T12:00:00\.000Z","Deputado Federal","SP","joao-da-silva"[\s\S]*"Confira os dados na fonte original antes de publicar\."/)
  value.rows[0].processos.ocorrencias.push({ numero: "2", tipo: "civil", tribunal: "TJ", urlFonte: "", fonteNivel: "oficial", dataInicio: null, dataDecisao: null })
  assert.equal(buildImprensaLongRows(value, "sites").length, 1)
  assert.equal(buildImprensaLongRows(value, "processos").length, 1)
  value.rows[0].processos.ocorrencias.push({ numero: "3", tipo: "civil", tribunal: "TJ", urlFonte: "http://tribunal.example/processo/3", fonteNivel: "oficial", dataInicio: null, dataDecisao: null })
  assert.equal(buildImprensaLongRows(value, "processos").length, 1)
  value.rows[0].processos.ocorrencias.push({ numero: "4", tipo: "civil", tribunal: "TJ", urlFonte: "https://jornal.example/materia-sobre-o-processo", fonteNivel: "em_confirmacao", dataInicio: null, dataDecisao: null })
  const longRows = buildImprensaLongRows(value, "processos") as Array<{ numero: string | null; fonte_nivel: string }>
  assert.deepEqual(longRows.map((row) => [row.numero, row.fonte_nivel]), [["1", "oficial"], ["4", "em_confirmacao"]])
  assert.match(serializeImprensaLongCsv(value, "processos"), /"url_fonte","fonte_nivel","data_inicio"/)
})

test("CSV e JSON levam a situação oficial do vice que a ficha mostra", () => {
  const value = dataset()
  const situacao = { label: "Inapto no TSE", source_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/SP/20322002026/candidato/1", checked_at: "2026-09-20T00:00:00.000Z" }
  value.rows[0].chapa.viceSituacao = situacao
  const csv = serializeImprensaCsv(value)
  assert.match(csv, /"chapa_vice_situacao","chapa_vice_situacao_fonte_url"/)
  assert.match(csv, /"Inapto no TSE","https:\/\/divulgacandcontas\.tse\.jus\.br\//)
  assert.deepEqual(JSON.parse(serializeImprensaJson(value)).rows[0].chapa.viceSituacao, situacao)
})

function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]]
  let cell = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ",") { rows.at(-1)!.push(cell); cell = "" }
    else if (char === "\r" && text[index + 1] === "\n") { rows.at(-1)!.push(cell); cell = ""; rows.push([]); index += 1 }
    else cell += char
  }
  if (rows.at(-1)!.length === 0 && cell === "") rows.pop()
  return rows
}

test("famílias da ficha: zero declarado, verificado e não verificado não se confundem", () => {
  const csv = serializeImprensaCsv(dataset())
  const [columns, cells] = parseCsv(csv.replace(/^\ufeff/, ""))
  const value = (column: string) => cells[columns.indexOf(column)]
  // Colunas novas ficam no fim, antes só do aviso.
  assert.deepEqual(columns.slice(-24, -1), [
    "patrimonio_estado", "patrimonio_ano", "patrimonio_total", "patrimonio_valor_estado", "patrimonio_ano_anterior",
    "patrimonio_total_anterior", "patrimonio_variacao_pct", "patrimonio_fonte_url", "gastos_estado", "gastos_ultimo_ano",
    "gastos_ultimo_ano_total", "gastos_anos_em_revisao", "tcu_estado", "tcu_registros", "tcu_consultado_em", "tcu_fonte_url",
    "sancoes_estado", "sancoes_quantidade", "sancoes_consultado_em", "sancoes_fonte_url",
    "processos_judiciais", "processos_disciplinares", "processos_total",
  ])
  assert.equal(value("patrimonio_total"), "0")
  assert.equal(value("patrimonio_valor_estado"), "sem_bens_declarados")
  assert.equal(value("patrimonio_variacao_pct"), "")
  assert.equal(value("gastos_ultimo_ano_total"), "1234.5")
  assert.equal(value("gastos_anos_em_revisao"), "2024")
  assert.equal(value("tcu_estado"), "nao_verificado")
  assert.equal(value("tcu_registros"), "")
  assert.equal(value("sancoes_quantidade"), "0")

  const json = JSON.parse(serializeImprensaJson(dataset()))
  assert.equal(json.version, "2")
  assert.equal(json.rows[0].tcu.registros, null)
  assert.equal(json.rows[0].sancoes.quantidade, 0)
  assert.equal(json.rows[0].gastos.anos, undefined, "linhas anuais só no export longo")
})

test("export longo de gastos: uma linha por ano e casa, com fonte ou null", () => {
  const rows = buildImprensaLongRows(dataset(), "gastos")
  assert.deepEqual(rows, [
    { slug: "joao-da-silva", ano: 2025, casa: "camara", total: 1234.5, fonte_url: "https://www.camara.leg.br/cotas/Ano-2025.csv.zip" },
    { slug: "joao-da-silva", ano: 2023, casa: "senado", total: 99, fonte_url: null },
  ])
  const csv = serializeImprensaLongCsv(dataset(), "gastos")
  const lines = csv.replace(/^\ufeff/, "").trim().split("\r\n")
  assert.equal(lines[0], '"version","generated_at","cargo_filtro","uf_filtro","slug","ano","casa","total","fonte_url","aviso"')
  assert.equal(lines.length, 3)
  assert.ok(lines[2].includes('"senado","99",,'), "fonte ausente é célula vazia, não texto inventado")
})
