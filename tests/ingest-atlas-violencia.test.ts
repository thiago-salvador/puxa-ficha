import assert from "node:assert/strict"
import test from "node:test"

import { normalizarAtlasValor } from "../scripts/lib/ingest-atlas-violencia"

test("Atlas vigente converte código IBGE estadual e valor numérico", () => {
  assert.deepEqual(
    normalizarAtlasValor({
      valor: 33.85,
      periodo: "2024-01-15T00:00:00.000Z",
      serie_id: 20,
      tipo_regiao: 3,
      regiao_id: 11,
    }),
    { uf: "RO", ano: 2024, valor: 33.85 },
  )
})

test("Atlas rejeita abrangência não estadual", () => {
  assert.equal(
    normalizarAtlasValor({
      valor: 10,
      periodo: "2024-01-15T00:00:00.000Z",
      serie_id: 20,
      tipo_regiao: 8,
      regiao_id: 1100205,
    }),
    null,
  )
})

test("Atlas rejeita código estadual e valor inválidos", () => {
  assert.equal(
    normalizarAtlasValor({
      valor: "n/a",
      periodo: "2024-01-15T00:00:00.000Z",
      serie_id: 20,
      tipo_regiao: 3,
      regiao_id: 99,
    }),
    null,
  )
})
