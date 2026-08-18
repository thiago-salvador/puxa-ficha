/**
 * Sinais read-only de cobertura de carreira em `historico_politico` (heurísticas).
 * Não infere mandatos nem completa lacunas — só aponta padrões suspeitos para curadoria.
 */

import { resolveHistoricoRowProvenance } from "../../src/lib/historico-provenance"

export interface HistoricoRowLike {
  observacoes: string | null
  periodo_inicio: number | null
  /** Quando preenchido, prevalece sobre substring em `observacoes` (ver `resolveHistoricoRowProvenance`). */
  proveniencia?: string | null
}

export interface CareerCoverageSignals {
  historico_row_count: number
  min_periodo_inicio: number | null
  /** Todas as rows com observação classificável como TSE (pode ser vazio → false). */
  all_rows_infer_as_tse: boolean
  /**
   * Heurística: há linhas, todas parecem só TSE e o mandato/candidatura mais antigo
   * começa em 1994 ou depois — possível ausência de complementação pré-janela típica do CSV TSE.
   */
  tse_window_only_heuristic: boolean
  /**
   * `wikidata_id` no candidato, histórico não vazio, e **nenhuma** row com proveniência efetiva
   * `wikidata` (`resolveHistoricoRowProvenance`: coluna `proveniencia` ou marcadores legados em `observacoes`).
   * Nome explícito do que o boolean mede; **não** implica «P39 não refletido» sem leitura humana.
   */
  wikidata_obs_marker_absent: boolean
  /**
   * Combinação heurística: `wikidata_obs_marker_absent` **e** `tse_window_only_heuristic`.
   * Sugere candidato a rever **complementação fora da janela típica TSE** (ex. ingest P39 ou curadoria
   * pré-1994) — ainda **soft signal**, sem prova de lacuna.
   */
  possible_non_tse_career_coverage_gap: boolean
  /**
   * @deprecated Preferir `wikidata_obs_marker_absent` (mesmo valor). Mantido para consumidores JSON/CI
   * que já liam este campo; será removido só após migração explícita.
   */
  wikidata_id_without_wikidata_rows: boolean
}

export function computeCareerCoverageSignals(
  historico: readonly HistoricoRowLike[],
  options?: { wikidata_id?: string | null },
): CareerCoverageSignals {
  const wikidataId = options?.wikidata_id?.trim() ?? ""

  if (historico.length === 0) {
    return {
      historico_row_count: 0,
      min_periodo_inicio: null,
      all_rows_infer_as_tse: false,
      tse_window_only_heuristic: false,
      wikidata_obs_marker_absent: false,
      possible_non_tse_career_coverage_gap: false,
      wikidata_id_without_wikidata_rows: false,
    }
  }

  let minStart: number | null = null
  let allTse = true
  let anyWikidataRow = false

  for (const row of historico) {
    const start = row.periodo_inicio
    if (typeof start === "number" && Number.isFinite(start)) {
      minStart = minStart == null ? start : Math.min(minStart, start)
    }
    const src = resolveHistoricoRowProvenance(row)
    if (src !== "tse") {
      allTse = false
    }
    if (src === "wikidata") {
      anyWikidataRow = true
    }
  }

  const tseWindowOnly =
    historico.length > 0 &&
    allTse &&
    minStart != null &&
    minStart >= 1994

  const wikidataObsMarkerAbsent = wikidataId.length > 0 && historico.length > 0 && !anyWikidataRow
  const possibleNonTseCareerCoverageGap = wikidataObsMarkerAbsent && tseWindowOnly

  return {
    historico_row_count: historico.length,
    min_periodo_inicio: minStart,
    all_rows_infer_as_tse: allTse,
    tse_window_only_heuristic: tseWindowOnly,
    wikidata_obs_marker_absent: wikidataObsMarkerAbsent,
    possible_non_tse_career_coverage_gap: possibleNonTseCareerCoverageGap,
    wikidata_id_without_wikidata_rows: wikidataObsMarkerAbsent,
  }
}
