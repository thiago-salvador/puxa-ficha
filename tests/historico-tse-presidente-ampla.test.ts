import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  hasTsePresidenteWideOverlappingSegmentedMandates,
  hasTsePresidenteElectionYearVsPosseConflict,
} from "../scripts/lib/historico-runtime-duplicate-rules"
import type { HistoricoPolitico } from "../src/lib/types"

/**
 * Guard contra rows TSE presidenciais amplas/abertas que conflitam com mandatos canônicos tier-1.
 *
 * Contexto: as regras canônicas de negócio Fluxo 2 (hardening 2026-04-17) identificou resíduos em `lula`:
 * - Row TSE `Presidente da República 2002–2022` (ampla) cobrindo múltiplos mandatos segmentados
 * - Row TSE `Presidente da República 2022–null` (eleição vs posse) coexistindo com mandato 2023–null
 *
 * Este teste valida o guard que detecta esses padrões sem quebrar normalizações legítimas
 * de ano de eleição vs posse para outros cargos.
 */

type HistoricoRowFixture = {
  id: string
  cargo: string
  cargo_canonico: string | null
  periodo_inicio: number | null
  periodo_fim: number | null
  observacoes: string | null
  proveniencia: string | null
}

function toHistoricoPolitico(row: HistoricoRowFixture): HistoricoPolitico {
  return {
    id: row.id,
    candidato_id: "test-candidate-id",
    cargo: row.cargo,
    cargo_canonico: row.cargo_canonico,
    tipo_evento: row.observacoes?.toLowerCase().includes("candidatura") ? "candidatura" : "mandato",
    periodo_inicio: row.periodo_inicio,
    periodo_fim: row.periodo_fim,
    partido: "",
    estado: "",
    eleito_por: "",
    observacoes: row.observacoes,
    proveniencia: row.proveniencia ?? null,
  }
}

describe("guard TSE Presidente — rows amplas/abertas vs mandatos tier-1", () => {
  describe("detecta row TSE ampla cobrindo múltiplos mandatos segmentados", () => {
    it("lula: TSE 2002–2022 cobre mandatos 2003–2006 e 2007–2010", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-wide",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2002,
          periodo_fim: 2022,
          observacoes: "ELEITO (TSE 2002)",
          proveniencia: "tse",
        },
        {
          id: "manual-1",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2003,
          periodo_fim: 2006,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
        {
          id: "manual-2",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2007,
          periodo_fim: 2010,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        hasTsePresidenteWideOverlappingSegmentedMandates(historicoRows),
        "Deve detectar row TSE ampla cobrindo 2+ mandatos segmentados"
      )
    })

    it("não detecta quando TSE não é ampla (span < 12 anos)", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-narrow",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2002,
          periodo_fim: 2010,
          observacoes: "ELEITO (TSE 2002)",
          proveniencia: "tse",
        },
        {
          id: "manual-1",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2003,
          periodo_fim: 2006,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteWideOverlappingSegmentedMandates(historicoRows),
        "Não deve detectar quando span TSE < 12 anos"
      )
    })

    it("não detecta quando só 1 mandato manual dentro da TSE", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-wide",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2002,
          periodo_fim: 2022,
          observacoes: "ELEITO (TSE 2002)",
          proveniencia: "tse",
        },
        {
          id: "manual-1",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2003,
          periodo_fim: 2006,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteWideOverlappingSegmentedMandates(historicoRows),
        "Não deve detectar quando só 1 mandato manual dentro"
      )
    })

    it("não conta outra row TSE sem proveniência estruturada como mandato manual segmentado", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-wide",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2002,
          periodo_fim: 2022,
          observacoes: "ELEITO (TSE 2002)",
          proveniencia: "tse",
        },
        {
          id: "tse-segment",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2006,
          periodo_fim: 2010,
          observacoes: "ELEITO (TSE 2006)",
          proveniencia: null,
        },
        {
          id: "manual-1",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2003,
          periodo_fim: 2006,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteWideOverlappingSegmentedMandates(historicoRows),
        "Row com observação TSE e proveniência nula deve ser inferida como TSE, não como manual"
      )
    })

    it("não detecta para cargo diferente de Presidente", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-wide",
          cargo: "Deputado Federal",
          cargo_canonico: "Deputado Federal",
          periodo_inicio: 2002,
          periodo_fim: 2022,
          observacoes: "ELEITO (TSE 2002)",
          proveniencia: "tse",
        },
        {
          id: "manual-1",
          cargo: "Deputado Federal",
          cargo_canonico: "Deputado Federal",
          periodo_inicio: 2003,
          periodo_fim: 2006,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
        {
          id: "manual-2",
          cargo: "Deputado Federal",
          cargo_canonico: "Deputado Federal",
          periodo_inicio: 2007,
          periodo_fim: 2010,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteWideOverlappingSegmentedMandates(historicoRows),
        "Não deve detectar para cargo diferente de Presidente"
      )
    })
  })

  describe("detecta conflito ano eleição vs posse", () => {
    it("lula: TSE 2022–null coexiste com manual 2023–null", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-2022",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2022,
          periodo_fim: null,
          observacoes: "ELEITO (TSE 2022)",
          proveniencia: "tse",
        },
        {
          id: "manual-2023",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2023,
          periodo_fim: null,
          observacoes: "Mandato atual",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        hasTsePresidenteElectionYearVsPosseConflict(historicoRows),
        "Deve detectar conflito TSE 2022 vs manual 2023"
      )
    })

    it("não detecta quando não há mandato manual no ano seguinte", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-2022",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2022,
          periodo_fim: null,
          observacoes: "ELEITO (TSE 2022)",
          proveniencia: "tse",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteElectionYearVsPosseConflict(historicoRows),
        "Não deve detectar quando não há mandato manual no ano seguinte"
      )
    })

    it("não detecta quando mandato manual não é aberto", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-2022",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2022,
          periodo_fim: null,
          observacoes: "ELEITO (TSE 2022)",
          proveniencia: "tse",
        },
        {
          id: "manual-2023",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2023,
          periodo_fim: 2026,
          observacoes: "Mandato",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteElectionYearVsPosseConflict(historicoRows),
        "Não deve detectar quando mandato manual não é aberto"
      )
    })

    it("não usa row TSE sem proveniência estruturada como mandato manual de posse", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-2022",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2022,
          periodo_fim: null,
          observacoes: "ELEITO (TSE 2022)",
          proveniencia: "tse",
        },
        {
          id: "tse-2023",
          cargo: "Presidente da República",
          cargo_canonico: "Presidente",
          periodo_inicio: 2023,
          periodo_fim: null,
          observacoes: "ELEITO (TSE 2023)",
          proveniencia: null,
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteElectionYearVsPosseConflict(historicoRows),
        "Row com observação TSE e proveniência nula não deve ser tratada como mandato manual de posse"
      )
    })

    it("não detecta para cargo diferente de Presidente", () => {
      const rows: HistoricoRowFixture[] = [
        {
          id: "tse-2022",
          cargo: "Governador",
          cargo_canonico: "Governador",
          periodo_inicio: 2022,
          periodo_fim: null,
          observacoes: "ELEITO (TSE 2022)",
          proveniencia: "tse",
        },
        {
          id: "manual-2023",
          cargo: "Governador",
          cargo_canonico: "Governador",
          periodo_inicio: 2023,
          periodo_fim: null,
          observacoes: "Mandato atual",
          proveniencia: "manual",
        },
      ]

      const historicoRows = rows.map(toHistoricoPolitico)
      assert.ok(
        !hasTsePresidenteElectionYearVsPosseConflict(historicoRows),
        "Não deve detectar para cargo diferente de Presidente"
      )
    })
  })
})
