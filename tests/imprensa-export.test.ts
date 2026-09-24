import assert from "node:assert/strict"
import test from "node:test"
import type { ImprensaDataset } from "@/lib/imprensa-data"
import {
  buildImprensaLongRows,
  neutralizeCsvFormula,
  serializeImprensaCsv,
  serializeImprensaJson,
  serializeImprensaLongCsv,
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
        viceNome: null,
        viceNomeOriginal: null,
        fonteUrl: null,
        fonteSha256: null,
        snapshotEm: null,
      },
      processos: {
        estado: "cobertura_parcial",
        quantidade: null,
        ocorrencias: [{ numero: "1", tipo: "civil", tribunal: "TJ", urlFonte: "https://tribunal.example/processo/1", dataInicio: "2020-01-01", dataDecisao: null }],
      },
    }],
  }
}

test("CSV preserva UTF-8, quebras, separadores e neutraliza fórmulas", () => {
  const csv = serializeImprensaCsv(dataset())
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.match(csv, /"version","generated_at","cargo_filtro","uf_filtro"/)
  assert.match(csv, /"1","2026-09-22T12:00:00\.000Z","Deputado Federal","SP"/)
  assert.match(csv, /"João, Silva\nJúnior"/)
  for (const dangerous of ["=SUM(A1)", "+SUM(A1)", "-SUM(A1)", "@SUM(A1)"]) {
    assert.equal(neutralizeCsvFormula(dangerous), `'${dangerous}`)
  }
  for (const dangerous of ["\t=SUM(A1)", "\n=SUM(A1)", "\r=SUM(A1)", " =SUM(A1)"]) {
    assert.equal(neutralizeCsvFormula(dangerous), `'${dangerous}`)
  }
  assert.match(csv, /sites_quantidade/)
  assert.match(csv, /chapa_estado/)
})

test("JSON mantém filtros, data e distinção null/zero", () => {
  const parsed = JSON.parse(serializeImprensaJson(dataset()))
  assert.deepEqual(parsed.filters, { cargo: "Deputado Federal", uf: "SP" })
  assert.equal(parsed.generatedAt, "2026-09-22T12:00:00.000Z")
  assert.equal(parsed.rows[0].processos.quantidade, null)
  assert.equal("ocorrencias" in parsed.rows[0].sites, false)
  assert.equal("ocorrencias" in parsed.rows[0].processos, false)
  assert.deepEqual(parsed.rows[0].chapa, {
    estado: "sem_dado",
    viceNome: null,
    fonteUrl: null,
    fonteSha256: null,
    snapshotEm: null,
  })
})

test("longos publicam somente ocorrências comprovadas", () => {
  const value = dataset()
  assert.match(serializeImprensaLongCsv(value, "sites"), /"version","generated_at","cargo_filtro","uf_filtro","slug"/)
  assert.match(serializeImprensaLongCsv(value, "sites"), /"1","2026-09-22T12:00:00\.000Z","Deputado Federal","SP","joao-da-silva"/)
  value.rows[0].processos.ocorrencias.push({ numero: "2", tipo: "civil", tribunal: "TJ", urlFonte: "", dataInicio: null, dataDecisao: null })
  assert.equal(buildImprensaLongRows(value, "sites").length, 1)
  assert.equal(buildImprensaLongRows(value, "processos").length, 1)
  value.rows[0].processos.ocorrencias.push({ numero: "3", tipo: "civil", tribunal: "TJ", urlFonte: "http://tribunal.example/processo/3", dataInicio: null, dataDecisao: null })
  assert.equal(buildImprensaLongRows(value, "processos").length, 1)
})
