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
        ocorrencias: [{ numero: "1", tipo: "civil", tribunal: "TJ", urlFonte: "https://tribunal.example/processo/1", dataInicio: "2020-01-01", dataDecisao: null }],
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
    suplentes: [],
    fonteUrl: null,
    fonteSha256: null,
    snapshotEm: "2026-09-26T00:00:00.000Z",
  })
})

test("longos publicam somente ocorrências comprovadas", () => {
  const value = dataset()
  assert.match(serializeImprensaLongCsv(value, "sites"), /"version","generated_at","cargo_filtro","uf_filtro","slug".*"aviso"/)
  assert.ok(serializeImprensaLongCsv(value, "sites").startsWith(`\ufeff"version","generated_at"`))
  assert.match(serializeImprensaLongCsv(value, "sites"), /"1","2026-09-22T12:00:00\.000Z","Deputado Federal","SP","joao-da-silva"[\s\S]*"Confira os dados na fonte original antes de publicar\."/)
  value.rows[0].processos.ocorrencias.push({ numero: "2", tipo: "civil", tribunal: "TJ", urlFonte: "", dataInicio: null, dataDecisao: null })
  assert.equal(buildImprensaLongRows(value, "sites").length, 1)
  assert.equal(buildImprensaLongRows(value, "processos").length, 1)
  value.rows[0].processos.ocorrencias.push({ numero: "3", tipo: "civil", tribunal: "TJ", urlFonte: "http://tribunal.example/processo/3", dataInicio: null, dataDecisao: null })
  assert.equal(buildImprensaLongRows(value, "processos").length, 1)
})
