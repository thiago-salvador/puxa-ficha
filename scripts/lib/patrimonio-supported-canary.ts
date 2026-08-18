/**
 * Fase 3 — Dinheiro do candidato: patrimônio em anos suportados (2010–2024).
 * Lista de anos espelha `DEFAULT_ANOS_DINHEIRO` em `scripts/lib/dinheiro-cohort-coverage-audit.ts`
 * (e o ingest / `audit-historical-sq-coverage.ts`). Matriz P1–P4 no plano do fluxo Dinheiro.
 */

import { DEFAULT_ANOS_DINHEIRO } from "./dinheiro-cohort-coverage-audit"
import type { SqExceptionEntry } from "./dinheiro-cohort-coverage-audit"

/** Mesma ordem e valores que `DEFAULT_ANOS_DINHEIRO` / audit de coorte Dinheiro. */
const DEFAULT_ANOS_PATRIMONIO_SUPPORTED: readonly number[] = DEFAULT_ANOS_DINHEIRO

/** P1 linha TSE; P2 declaração sem bens (linha com total zero e sem bens); P3 exceção fonte; P4 fora da obrigação (homônimo / pendente). */
export type PatrimonioSupportedState = "P1" | "P2" | "P3" | "P4" | "GAP"

export interface PatrimonioRowLite {
  ano_eleicao: number
  valor_total: number | null
  /** comprimento do array JSON `bens` quando disponível */
  bens_count: number
}

export function eligiblePatrimonioSupportedYearsFromSeed(tseSqByYear: Record<string, string> | undefined): number[] {
  const keys = Object.keys(tseSqByYear ?? {})
    .map((k) => Number(k))
    .filter((y) => Number.isFinite(y))
  const supported = new Set<number>(DEFAULT_ANOS_PATRIMONIO_SUPPORTED)
  return [...new Set(keys.filter((y) => supported.has(y)))].sort((a, b) => a - b)
}

/** Shape mínimo do JSON emitido por `scripts/audit-dinheiro-cohort-coverage.ts`. */
interface CohortDinheiroAuditYearRow {
  slug: string
  ano: number
  patrimonio: string
}

interface CohortDinheiroAuditJson {
  entries?: Array<{
    years?: CohortDinheiroAuditYearRow[]
  }>
}

/**
 * Extrai pares (slug, ano) com `patrimonio === "gap_no_row"` no relatório de coorte
 * (já exclui `exception_*` no lado patrimônio — esses anos não aparecem como gap).
 */
export function collectPatrimonioGapNoRowPairsFromCohortAuditJson(raw: unknown): Array<{ slug: string; ano: number }> {
  const rec = raw as CohortDinheiroAuditJson
  const pairs: Array<{ slug: string; ano: number }> = []
  for (const ent of rec.entries ?? []) {
    for (const y of ent.years ?? []) {
      if (y.patrimonio === "gap_no_row" && typeof y.slug === "string" && Number.isFinite(Number(y.ano))) {
        pairs.push({ slug: y.slug, ano: Number(y.ano) })
      }
    }
  }
  pairs.sort((a, b) => (a.slug === b.slug ? a.ano - b.ano : a.slug.localeCompare(b.slug)))
  return pairs
}

/**
 * Indexa `sq-exceptions` por `slug|ano`. Múltiplas entradas por chave são
 * preservadas (ver nota em `scripts/lib/dinheiro-cohort-coverage-audit.ts`).
 */
export function buildSqExceptionsMapFromEntries(
  entries: SqExceptionEntry[],
): Map<string, SqExceptionEntry[]> {
  const map = new Map<string, SqExceptionEntry[]>()
  for (const e of entries) {
    const key = `${e.slug}|${e.ano}`
    const bucket = map.get(key)
    if (bucket) bucket.push(e)
    else map.set(key, [e])
  }
  return map
}

/**
 * Classifica um ano elegível (já restrito a DEFAULT_ANOS) face a linhas em `patrimonio` e `sq-exceptions`.
 *
 * Razões de `sq-exceptions.json` relevantes para patrimônio: `no-bens-at-source`
 * (→ P3), `homonym-*` (→ P4). Razões específicas de financiamento (ex.:
 * `no-receita-at-source`) são ignoradas aqui.
 */
export function classifyPatrimonioSupportedYear(input: {
  slug: string
  year: number
  rowsByYear: Map<number, PatrimonioRowLite>
  exceptions: SqExceptionEntry[]
}): PatrimonioSupportedState {
  const { rowsByYear, exceptions } = input
  const year = input.year
  const row = rowsByYear.get(year)

  if (row) {
    const total = row.valor_total ?? 0
    if (total === 0 && row.bens_count === 0) {
      return "P2"
    }
    return "P1"
  }

  if (exceptions.some((e) => e.reason === "no-bens-at-source")) {
    return "P3"
  }

  if (
    exceptions.some(
      (e) =>
        e.reason === "homonym-false-positive" ||
        e.reason === "suspect-homonym-pending-verification",
    )
  ) {
    return "P4"
  }

  return "GAP"
}

/** Anos em falta no sentido `sq_years_supported_now − patrimonio_years` (sem filtrar exceções). */
export function missingSupportedPatrimonioYears(eligibleYears: number[], patrimonioYears: number[]): number[] {
  const have = new Set(patrimonioYears)
  return eligibleYears.filter((y) => !have.has(y))
}
