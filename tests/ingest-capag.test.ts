import assert from "node:assert/strict"
import test from "node:test"

import { extrairCapagRow } from "../scripts/lib/ingest-capag"

test("CAPAG oficial reconhece cabecalho acentuado e ano-base declarado", () => {
  const row = {
    UF: "AL",
    "Indicador 1": "86,90%",
    "Indicador 2": "88,31%",
    "Indicador 3": "0,36%",
    "Classificação da CAPAG": "B+",
  }

  assert.deepEqual(extrairCapagRow(row, 2024), {
    uf: "AL",
    ano: 2024,
    nota: "B+",
    ind1: "86,90%",
    ind2: "88,31%",
    ind3: "0,36%",
  })
})

test("CAPAG preserva ano explicito quando o recurso o fornece", () => {
  assert.equal(extrairCapagRow({ UF: "AC", Ano: "2023" }, 2024)?.ano, 2023)
})

test("CAPAG ignora linha sem UF valida", () => {
  assert.equal(extrairCapagRow({ UF: "XX", "Classificação da CAPAG": "A" }, 2024), null)
})
