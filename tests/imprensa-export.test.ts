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
    version: "1",
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
    }],
  }
}

test("CSV preserva UTF-8, quebras, separadores e neutraliza fórmulas", () => {
  const csv = serializeImprensaCsv(dataset())
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.ok(csv.startsWith(`\ufeff"version","generated_at","cargo_filtro","uf_filtro"`))
  assert.match(csv, /"version","generated_at","cargo_filtro","uf_filtro".*"aviso"/)
  assert.match(csv, /"1","2026-09-22T12:00:00\.000Z","Deputado Federal","SP"[\s\S]*"Confira os dados na fonte original antes de publicar\."/)
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
  assert.match(serializeImprensaLongCsv(value, "sites"), /"1","2026-09-22T12:00:00\.000Z","Deputado Federal","SP","joao-da-silva"[\s\S]*"Confira os dados na fonte original antes de publicar\."/)
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
