import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  inferHistoricoTipoEventoFromRow,
  isHistoricoCandidaturaRow,
} from "../src/lib/historico-tipo-evento"

describe("historico-tipo-evento", () => {
  it("usa coluna tipo_evento quando definida", () => {
    assert.equal(
      inferHistoricoTipoEventoFromRow({ tipo_evento: "candidatura", observacoes: "x" }),
      "candidatura",
    )
    assert.equal(inferHistoricoTipoEventoFromRow({ tipo_evento: "mandato" }), "mandato")
  })

  it("detecta candidatura pelo prefixo Candidatura:", () => {
    assert.equal(
      inferHistoricoTipoEventoFromRow({
        observacoes: "Candidatura: NÃO ELEITO (TSE 2020)",
        periodo_inicio: 2020,
        periodo_fim: 2020,
      }),
      "candidatura",
    )
    assert.ok(
      isHistoricoCandidaturaRow({
        observacoes: "Candidatura: SUPLENTE (TSE 2022)",
        periodo_inicio: 2022,
        periodo_fim: 2022,
      }),
    )
  })

  it("heurística TSE mesmo ano início/fim", () => {
    assert.equal(
      inferHistoricoTipoEventoFromRow({
        observacoes: "Algo (TSE 2018)",
        periodo_inicio: 2018,
        periodo_fim: 2018,
      }),
      "candidatura",
    )
  })

  it("default mandato", () => {
    assert.equal(
      inferHistoricoTipoEventoFromRow({
        observacoes: "ELEITO (TSE 2022)",
        periodo_inicio: 2022,
        periodo_fim: null,
      }),
      "mandato",
    )
  })
})
