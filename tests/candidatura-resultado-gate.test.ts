import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  extrairResultadoFinal,
  linhasSemResultadoFinal,
  type HistoricoCandidaturaGateRow,
} from "../scripts/audit/lib/candidatura-resultado-gate"

describe("gate de resultado de candidatura", () => {
  it("reconhece todos os vereditos finais permitidos", () => {
    for (const resultado of [
      "ELEITO",
      "NÃO ELEITO",
      "ELEITO POR MÉDIA",
      "SUPLENTE",
      "INAPTO",
      "REGISTRO NEGADO",
      "DESISTIU",
      "RENÚNCIA",
    ]) {
      assert.equal(extrairResultadoFinal(`Candidatura: ${resultado} (TSE 2022)`), resultado)
    }
  })

  it("reprova MÉDIA truncado, vazio e 2º TURNO sem resultado final", () => {
    const rows: HistoricoCandidaturaGateRow[] = [
      { id: "media", tipo_evento: "candidatura", periodo_inicio: 2010, observacoes: "Candidatura: MÉDIA (TSE 2010)" },
      { id: "vazio", tipo_evento: "candidatura", periodo_inicio: 2018, observacoes: "Candidatura: (TSE 2018)" },
      { id: "turno", tipo_evento: "candidatura", periodo_inicio: 2018, observacoes: "Candidatura: 2º TURNO (TSE 2018)" },
      { id: "corrente", tipo_evento: "candidatura", periodo_inicio: 2026, observacoes: null },
      { id: "mandato", tipo_evento: "mandato", periodo_inicio: 2018, observacoes: null },
    ]
    assert.deepEqual(linhasSemResultadoFinal(rows, 2026).map((row) => row.id), ["media", "vazio", "turno"])
  })

  it("o snapshot offline do CI passa integralmente", () => {
    const path = join(
      import.meta.dirname,
      "..",
      "scripts",
      "audit",
      "snapshots",
      "historico-candidaturas-resultado-gate.json",
    )
    const fixture = JSON.parse(readFileSync(path, "utf8")) as {
      ciclo_corrente: number
      linhas: HistoricoCandidaturaGateRow[]
    }
    assert.deepEqual(linhasSemResultadoFinal(fixture.linhas, fixture.ciclo_corrente), [])
  })
})
