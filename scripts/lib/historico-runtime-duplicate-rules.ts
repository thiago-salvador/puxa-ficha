/**
 * Regras puras para o audit runtime de `historico_politico` (sem I/O).
 * Separa “duplicata semântica” de artefatos TSE (ano de eleição vs posse, ingestões paralelas).
 */

import {
  inferHistoricoObsSource,
  resolveHistoricoRowProvenance,
} from "../../src/lib/historico-provenance"
import { canonicalCargo } from "./cargo-utils"
import type { HistoricoPolitico } from "../../src/lib/types"

export { inferHistoricoObsSource, resolveHistoricoRowProvenance }

/** Sobreposição inclusiva em anos inteiros; `fim === null` = mandato aberto (∞). */
export function historicoInclusiveYearRangesOverlap(
  inicioA: number,
  fimA: number | null,
  inicioB: number,
  fimB: number | null,
): boolean {
  const endA = fimA ?? Number.POSITIVE_INFINITY
  const endB = fimB ?? Number.POSITIVE_INFINITY
  return Math.max(inicioA, inicioB) <= Math.min(endA, endB)
}

/**
 * Duas linhas só TSE, mesmo cargo canónico (garantido pelo chamador), inícios em anos consecutivos
 * e janelas de mandato que se sobrepõem: padrão típico de eleição vs posse ou de ingestão duplicada
 * benigna — não tratar como duplicata semântica no audit.
 *
 * `provenienciaA` / `provenienciaB` opcionais alinham ao fallback estruturado (coluna antes de substring).
 */
export function isTseAdjacentYearOverlappingMandatePair(
  observacoesA: string | null,
  observacoesB: string | null,
  inicioA: number,
  inicioB: number,
  fimA: number | null,
  fimB: number | null,
  provenienciaA: string | null = null,
  provenienciaB: string | null = null,
): boolean {
  if (
    resolveHistoricoRowProvenance({ observacoes: observacoesA, proveniencia: provenienciaA }) !== "tse" ||
    resolveHistoricoRowProvenance({ observacoes: observacoesB, proveniencia: provenienciaB }) !== "tse"
  ) {
    return false
  }
  if (Math.abs(inicioA - inicioB) !== 1) return false
  return historicoInclusiveYearRangesOverlap(inicioA, fimA, inicioB, fimB)
}

/**
 * Guard contra rows TSE presidenciais amplas/abertas que conflitam com mandatos canônicos tier-1.
 *
 * Contexto: curadoria interna Fluxo 2 (hardening 2026-04-17) identificou resíduos em `lula`:
 * - Row TSE `Presidente da República 2002–2022` (ampla) cobrindo múltiplos mandatos segmentados
 * - Row TSE `Presidente da República 2022–null` (eleição vs posse) coexistindo com mandato 2023–null
 *
 * Este guard é específico para cargo canônico `Presidente` e não afeta normalizações legítimas
 * de ano de eleição vs posse para outros cargos.
 */

function effectiveCargoCanon(row: HistoricoPolitico): string {
  return (row.cargo_canonico?.trim() || canonicalCargo(row.cargo)).trim()
}

function isTseRow(row: HistoricoPolitico): boolean {
  return resolveHistoricoRowProvenance(row) === "tse"
}

function isManualRow(row: HistoricoPolitico): boolean {
  return resolveHistoricoRowProvenance(row) === "manual"
}

function rowSpan(row: HistoricoPolitico): number {
  if (row.periodo_inicio == null || row.periodo_fim == null) return 0
  return row.periodo_fim - row.periodo_inicio
}

/**
 * Detecta row TSE de Presidente com span amplo (≥ 12 anos) que cobre
 * 2+ mandatos manuais segmentados do mesmo cargo canônico.
 */
export function hasTsePresidenteWideOverlappingSegmentedMandates(rows: readonly HistoricoPolitico[]): boolean {
  const WIDE_SPAN_THRESHOLD = 12
  const presidenteCanon = "Presidente"

  const presidenteRows = rows.filter((r) => effectiveCargoCanon(r) === presidenteCanon)
  const tseRows = presidenteRows.filter(isTseRow)
  const manualRows = presidenteRows.filter(isManualRow)

  for (const tse of tseRows) {
    if (tse.periodo_inicio == null || tse.periodo_fim == null) continue
    const span = rowSpan(tse)
    if (span < WIDE_SPAN_THRESHOLD) continue

    const tseStart = tse.periodo_inicio
    const tseEnd = tse.periodo_fim

    // Conta quantos mandatos manuais segmentados cabem dentro da row TSE ampla
    let innerCount = 0
    for (const manual of manualRows) {
      if (manual.id === tse.id) continue
      if (manual.periodo_inicio == null || manual.periodo_fim == null) continue
      const manualSpan = rowSpan(manual)
      if (manualSpan >= span) continue // Não é "segmentado" se for igual ou maior que a TSE

      // Verifica se o mandato manual cabe inteiramente dentro da row TSE
      if (manual.periodo_inicio >= tseStart && manual.periodo_fim <= tseEnd) {
        innerCount++
      }
    }

    if (innerCount >= 2) return true
  }

  return false
}

/**
 * Detecta row TSE de Presidente com periodo_inicio = ano_eleição
 * quando existe mandato manual com periodo_inicio = ano_eleicao + 1.
 * Padrão típico: eleição em 2022, posse em 2023.
 */
export function hasTsePresidenteElectionYearVsPosseConflict(rows: readonly HistoricoPolitico[]): boolean {
  const presidenteCanon = "Presidente"

  const presidenteRows = rows.filter((r) => effectiveCargoCanon(r) === presidenteCanon)
  const tseRows = presidenteRows.filter(isTseRow)
  const manualRows = presidenteRows.filter(isManualRow)

  for (const tse of tseRows) {
    if (tse.periodo_inicio == null) continue
    const electionYear = tse.periodo_inicio

    // Busca mandato manual começando no ano seguinte
    const conflict = manualRows.find(
      (m) =>
        m.periodo_inicio === electionYear + 1 &&
        m.periodo_fim == null // Mandato aberto (atual)
    )

    if (conflict) return true
  }

  return false
}
