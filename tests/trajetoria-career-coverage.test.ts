import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { computeCareerCoverageSignals } from "../scripts/lib/trajetoria-career-coverage"

describe("computeCareerCoverageSignals", () => {
  it("marca heuristica tse-only quando todas as rows sao TSE e inicio >= 1994", () => {
    const s = computeCareerCoverageSignals(
      [
        { observacoes: "ELEITO (TSE 1998)", periodo_inicio: 1998 },
        { observacoes: "ELEITO (TSE 2002)", periodo_inicio: 2002 },
      ],
      { wikidata_id: null },
    )
    assert.equal(s.tse_window_only_heuristic, true)
    assert.equal(s.all_rows_infer_as_tse, true)
  })

  it("nao marca wikidata_obs_marker_absent quando proveniencia estruturada e wikidata sem substring", () => {
    const s = computeCareerCoverageSignals(
      [{ observacoes: "Curadoria: P39 espelhado sem marcador textual", periodo_inicio: 1990, proveniencia: "wikidata" }],
      { wikidata_id: "Q1" },
    )
    assert.equal(s.wikidata_obs_marker_absent, false)
    assert.equal(s.tse_window_only_heuristic, false)
  })

  it("nao marca tse-only quando ha observacao Wikidata", () => {
    const s = computeCareerCoverageSignals(
      [{ observacoes: "Importado automaticamente de Wikidata P39 em 2026-04-06", periodo_inicio: 1990 }],
      { wikidata_id: "Q1" },
    )
    assert.equal(s.tse_window_only_heuristic, false)
    assert.equal(s.wikidata_obs_marker_absent, false)
    assert.equal(s.possible_non_tse_career_coverage_gap, false)
    assert.equal(s.wikidata_id_without_wikidata_rows, false)
  })

  it("gap curatorial provavel: só TSE + wikidata_id sem marcador Wikidata → obs_marker e possible_non_tse", () => {
    const s = computeCareerCoverageSignals(
      [{ observacoes: "ELEITO (TSE 2002)", periodo_inicio: 2002 }],
      { wikidata_id: "Q1" },
    )
    assert.equal(s.wikidata_obs_marker_absent, true)
    assert.equal(s.tse_window_only_heuristic, true)
    assert.equal(s.possible_non_tse_career_coverage_gap, true)
    assert.equal(s.wikidata_id_without_wikidata_rows, s.wikidata_obs_marker_absent)
  })

  it("falso positivo semantico relativo a lacuna P39: curadoria manual + Q-id → obs_marker true, possible_non_tse false", () => {
    const s = computeCareerCoverageSignals(
      [
        {
          observacoes: "Vice-prefeito de Natal (O Globo + curadoria 11.csv)",
          periodo_inicio: 2017,
        },
        {
          observacoes: "Filiação ao PDT em 2003 após mandatos pelo PMDB na ALERN (ALERN memorial)",
          periodo_inicio: 2003,
        },
      ],
      { wikidata_id: "Q30936059" },
    )
    assert.equal(s.wikidata_obs_marker_absent, true)
    assert.equal(s.all_rows_infer_as_tse, false)
    assert.equal(s.tse_window_only_heuristic, false)
    assert.equal(s.possible_non_tse_career_coverage_gap, false)
    assert.equal(s.wikidata_id_without_wikidata_rows, s.wikidata_obs_marker_absent)
  })

  it("ambiguo: mistura TSE + manual sem Wikidata — obs_marker conforme Q-id; possible_non_tse false", () => {
    const s = computeCareerCoverageSignals(
      [
        { observacoes: "ELEITO (TSE 2018)", periodo_inicio: 2018 },
        { observacoes: "Mandato atual (Planalto)", periodo_inicio: 2023 },
      ],
      { wikidata_id: "Q2" },
    )
    assert.equal(s.wikidata_obs_marker_absent, true)
    assert.equal(s.all_rows_infer_as_tse, false)
    assert.equal(s.possible_non_tse_career_coverage_gap, false)
  })

  it("lista vazia nao gera heuristicas positivas", () => {
    const s = computeCareerCoverageSignals([], { wikidata_id: "Q1" })
    assert.equal(s.historico_row_count, 0)
    assert.equal(s.tse_window_only_heuristic, false)
    assert.equal(s.wikidata_obs_marker_absent, false)
    assert.equal(s.possible_non_tse_career_coverage_gap, false)
    assert.equal(s.wikidata_id_without_wikidata_rows, false)
  })
})
