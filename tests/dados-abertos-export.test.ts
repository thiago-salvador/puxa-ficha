import assert from "node:assert/strict"
import test from "node:test"
import type { DadosAbertosDataset } from "../src/lib/dados-abertos"
import { serializeDadosAbertosCsv, serializeDadosAbertosJson } from "../src/lib/dados-abertos-export"

function dataset(): DadosAbertosDataset {
  return {
    version: "1",
    generatedAt: "2026-09-23T12:00:00.000Z",
    filters: { cargo: "Governador", uf: "SP" },
    availableCargos: ["Governador"],
    availableUfs: ["SP"],
    rows: [
      {
        slug: "joao-da-silva",
        nomeUrna: "João, Silva\nJúnior",
        nomeCompleto: "João da Silva Júnior",
        cargo: "Governador",
        uf: "SP",
        partido: "ABC",
        situacao: "deferido",
        numeroUrna: "13",
        fichaUrl: "/candidato/joao-da-silva",
        ultimaAtualizacao: "2026-09-20T00:00:00.000Z",
        fontes: ["tse-divulgacand", "portal-transparencia"],
      },
    ],
  }
}

test("CSV preserva UTF-8, quebras e neutraliza fórmulas", () => {
  const csv = serializeDadosAbertosCsv(dataset())
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.match(csv, /"version","generated_at","cargo_filtro","uf_filtro","slug"/)
  assert.match(csv, /"1","2026-09-23T12:00:00\.000Z","Governador","SP"/)
  assert.match(csv, /"João, Silva\nJúnior"/)
  assert.match(csv, /"tse-divulgacand; portal-transparencia"/)
})

test("CSV neutraliza valores que uma planilha executaria como fórmula", () => {
  const value = dataset()
  value.rows[0].nomeCompleto = "=SUM(A1)"
  const csv = serializeDadosAbertosCsv(value)
  assert.match(csv, /"'=SUM\(A1\)"/)
})

test("JSON mantém filtros, licença e linhas completas", () => {
  const parsed = JSON.parse(serializeDadosAbertosJson(dataset()))
  assert.deepEqual(parsed.filters, { cargo: "Governador", uf: "SP" })
  assert.equal(parsed.generatedAt, "2026-09-23T12:00:00.000Z")
  assert.equal(parsed.license.code, "Apache-2.0")
  assert.deepEqual(parsed.rows[0].fontes, ["tse-divulgacand", "portal-transparencia"])
  assert.equal(parsed.rows[0].situacao, "deferido")
})

test("linha sem situação preserva null em vez de virar string vazia", () => {
  const value = dataset()
  value.rows[0].situacao = null
  const parsed = JSON.parse(serializeDadosAbertosJson(value))
  assert.equal(parsed.rows[0].situacao, null)
  const csv = serializeDadosAbertosCsv(value)
  assert.match(csv, /"ABC",,"13"/)
})
