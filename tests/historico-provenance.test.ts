import assert from "node:assert/strict"
import { test } from "node:test"
import {
  inferHistoricoObsSource,
  resolveHistoricoRowProvenance,
} from "../src/lib/historico-provenance"

test("resolveHistoricoRowProvenance: coluna prevalece sobre observacoes", () => {
  assert.equal(
    resolveHistoricoRowProvenance({
      observacoes: "ELEITO (TSE 2022)",
      proveniencia: "manual",
    }),
    "manual",
  )
  assert.equal(
    resolveHistoricoRowProvenance({
      observacoes: "Texto sem marcadores",
      proveniencia: "wikidata",
    }),
    "wikidata",
  )
})

test("resolveHistoricoRowProvenance: NULL coluna usa inferencia", () => {
  assert.equal(resolveHistoricoRowProvenance({ observacoes: "ELEITO (TSE 2022)", proveniencia: null }), "tse")
  assert.equal(resolveHistoricoRowProvenance({ observacoes: "Importado automaticamente de Wikidata" }), "wikidata")
})

test("inferHistoricoObsSource inalterado para contratos legados", () => {
  assert.equal(inferHistoricoObsSource("x"), "manual")
})
