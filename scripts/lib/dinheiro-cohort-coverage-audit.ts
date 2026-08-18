/**
 * Cobertura Dinheiro (coorte × anos elegíveis) — lógica pura.
 * Ancoragem: keys(ids.tse_sq_candidato) ∩ DEFAULT_ANOS (sem discovery TSE).
 * Ver `curadoria interna` (Fluxo 3).
 *
 * Observação: `sq-exceptions.json` pode conter **mais de uma entrada** por
 * `(slug, ano)` quando a evidência literal no TSE é distinta por dimensão
 * (ex.: `no-bens-at-source` no ficheiro `bem_candidato_<ano>` + `no-receita-at-source`
 * no ficheiro `receitas_candidatos_<ano>`). Por isso os helpers devolvem
 * arrays de entradas e os classificadores escolhem a razão relevante para
 * cada dimensão (patrimônio vs financiamento).
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

/** Alinhado a `scripts/audit-historical-sq-coverage.ts` (ingest padrão). */
export const DEFAULT_ANOS_DINHEIRO: readonly number[] = [
  2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024,
]

export type SqExceptionReason =
  | "homonym-false-positive"
  | "no-bens-at-source"
  | "no-receita-at-source"
  | "suspect-homonym-pending-verification"

export interface SqExceptionEntry {
  slug: string
  ano: number
  reason: SqExceptionReason
  detail: string
  confirmed: string | null
}

/** Estado por ano — patrimônio (matriz P1–P4 do plano, codificação operacional). */
export type PatrimonioCoverageState =
  | "materialized"
  | "gap_no_row"
  | "exception_no_bens_at_source"
  | "exception_homonym_false_positive"
  | "exception_homonym_pending_verification"

/** Estado por ano — financiamento (F1–F4; exceção específica de receita na fonte + homônimos). */
export type FinanciamentoCoverageState =
  | "materialized"
  | "gap_no_row"
  | "exception_no_receita_at_source"
  | "exception_homonym_false_positive"
  | "exception_homonym_pending_verification"

const EXCEPTIONS_PATH = resolve(process.cwd(), "data/sq-exceptions.json")

/**
 * Lê `data/sq-exceptions.json` e indexa por `slug|ano`.
 * Uma mesma chave pode ter várias entradas (ver nota do topo).
 */
export function loadSqExceptionsMap(): Map<string, SqExceptionEntry[]> {
  if (!existsSync(EXCEPTIONS_PATH)) return new Map()
  const raw = JSON.parse(readFileSync(EXCEPTIONS_PATH, "utf-8")) as { entries?: SqExceptionEntry[] }
  const map = new Map<string, SqExceptionEntry[]>()
  for (const entry of raw.entries ?? []) {
    const key = `${entry.slug}|${entry.ano}`
    const bucket = map.get(key)
    if (bucket) bucket.push(entry)
    else map.set(key, [entry])
  }
  return map
}

export function uniqueSortedYears(values: number[]): number[] {
  return [...new Set(values)].filter((y) => Number.isFinite(y)).sort((a, b) => a - b)
}

/**
 * Anos elegíveis “suportados agora”: SQ no seed para o ano e ano ∈ DEFAULT_ANOS.
 */
export function eligibleSupportedYearsFromSeed(sqByYear: Record<string, string> | undefined): number[] {
  const keys = Object.keys(sqByYear ?? {})
    .map((k) => Number(k))
    .filter((y) => Number.isFinite(y))
  const defaultSet = new Set(DEFAULT_ANOS_DINHEIRO)
  return uniqueSortedYears(keys.filter((y) => defaultSet.has(y)))
}

export function exceptionsForSlugYear(
  exceptions: Map<string, SqExceptionEntry[]>,
  slug: string,
  ano: number,
): SqExceptionEntry[] {
  return exceptions.get(`${slug}|${ano}`) ?? []
}

/** Alias legado singular — devolve a **primeira** entrada (ou `null`). */
export function exceptionForSlugYear(
  exceptions: Map<string, SqExceptionEntry[]>,
  slug: string,
  ano: number,
): SqExceptionEntry | null {
  return exceptions.get(`${slug}|${ano}`)?.[0] ?? null
}

function pickPatrimonioException(entries: SqExceptionEntry[]): SqExceptionEntry | null {
  for (const e of entries) {
    if (
      e.reason === "homonym-false-positive" ||
      e.reason === "suspect-homonym-pending-verification" ||
      e.reason === "no-bens-at-source"
    ) {
      return e
    }
  }
  return null
}

function pickFinanciamentoException(entries: SqExceptionEntry[]): SqExceptionEntry | null {
  for (const e of entries) {
    if (
      e.reason === "homonym-false-positive" ||
      e.reason === "suspect-homonym-pending-verification" ||
      e.reason === "no-receita-at-source"
    ) {
      return e
    }
  }
  return null
}

export function classifyPatrimonioYear(args: {
  hasPatrimonioRow: boolean
  exceptions: SqExceptionEntry[]
}): PatrimonioCoverageState {
  const { hasPatrimonioRow, exceptions } = args
  const exception = pickPatrimonioException(exceptions)
  if (exception) {
    if (exception.reason === "no-bens-at-source") return "exception_no_bens_at_source"
    if (exception.reason === "homonym-false-positive") return "exception_homonym_false_positive"
    if (exception.reason === "suspect-homonym-pending-verification") {
      return "exception_homonym_pending_verification"
    }
  }
  if (hasPatrimonioRow) return "materialized"
  return "gap_no_row"
}

export function classifyFinanciamentoYear(args: {
  hasFinanciamentoRow: boolean
  exceptions: SqExceptionEntry[]
}): FinanciamentoCoverageState {
  const { hasFinanciamentoRow, exceptions } = args
  const exception = pickFinanciamentoException(exceptions)
  if (exception) {
    if (exception.reason === "no-receita-at-source") return "exception_no_receita_at_source"
    if (exception.reason === "homonym-false-positive") return "exception_homonym_false_positive"
    if (exception.reason === "suspect-homonym-pending-verification") {
      return "exception_homonym_pending_verification"
    }
  }
  if (hasFinanciamentoRow) return "materialized"
  return "gap_no_row"
}

export interface YearMoneyCoverageRow {
  slug: string
  ano: number
  cargo_disputado: string
  estado: string | null
  sq: string | null
  patrimonio: PatrimonioCoverageState
  financiamento: FinanciamentoCoverageState
  /** Lista completa de exceções aplicáveis no par `(slug, ano)` — pode conter
   * múltiplas razões (ex.: `no-bens-at-source` + `no-receita-at-source`). */
  exceptions: Array<{ reason: SqExceptionReason; detail: string }>
}

export interface CandidateMoneyCoverageSummary {
  slug: string
  cargo_disputado: string
  estado: string | null
  candidato_id: string | null
  eligible_years: number[]
  patrimonio_years_in_db: number[]
  financiamento_years_in_db: number[]
  /** Linhas ano a ano (só anos elegíveis). */
  years: YearMoneyCoverageRow[]
  /** Contagens por estado — patrimônio. */
  patrimonio_state_counts: Record<PatrimonioCoverageState, number>
  /** Contagens por estado — financiamento. */
  financiamento_state_counts: Record<FinanciamentoCoverageState, number>
}

export function buildYearRowsForCandidate(args: {
  slug: string
  cargo_disputado: string
  estado: string | null
  sqByYear: Record<string, string> | undefined
  patrimonioYears: Set<number>
  financiamentoYears: Set<number>
  exceptions: Map<string, SqExceptionEntry[]>
}): YearMoneyCoverageRow[] {
  const eligible = eligibleSupportedYearsFromSeed(args.sqByYear)
  const rows: YearMoneyCoverageRow[] = []
  for (const ano of eligible) {
    const sq = args.sqByYear?.[String(ano)]?.trim() ?? null
    const excs = exceptionsForSlugYear(args.exceptions, args.slug, ano)
    const pat = classifyPatrimonioYear({
      hasPatrimonioRow: args.patrimonioYears.has(ano),
      exceptions: excs,
    })
    const fin = classifyFinanciamentoYear({
      hasFinanciamentoRow: args.financiamentoYears.has(ano),
      exceptions: excs,
    })
    rows.push({
      slug: args.slug,
      ano,
      cargo_disputado: args.cargo_disputado,
      estado: args.estado,
      sq,
      patrimonio: pat,
      financiamento: fin,
      exceptions: excs.map((e) => ({ reason: e.reason, detail: e.detail })),
    })
  }
  return rows
}

export function countPatrimonioStates(rows: YearMoneyCoverageRow[]): Record<PatrimonioCoverageState, number> {
  const init: Record<PatrimonioCoverageState, number> = {
    materialized: 0,
    gap_no_row: 0,
    exception_no_bens_at_source: 0,
    exception_homonym_false_positive: 0,
    exception_homonym_pending_verification: 0,
  }
  for (const r of rows) {
    init[r.patrimonio] += 1
  }
  return init
}

export function countFinanciamentoStates(rows: YearMoneyCoverageRow[]): Record<FinanciamentoCoverageState, number> {
  const init: Record<FinanciamentoCoverageState, number> = {
    materialized: 0,
    gap_no_row: 0,
    exception_no_receita_at_source: 0,
    exception_homonym_false_positive: 0,
    exception_homonym_pending_verification: 0,
  }
  for (const r of rows) {
    init[r.financiamento] += 1
  }
  return init
}
