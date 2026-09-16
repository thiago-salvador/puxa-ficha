import { stripAccents } from "../../src/lib/strip-accents"

export type TseElectionContext = {
  ano_eleicao: number | string
  dt_eleicao?: string | null
  nm_tipo_eleicao?: string | null
}

export type EffectiveElectionContext = {
  sourceYear: number
  effectiveYear: number
  electionDate: string | null
  supplementary: boolean
}

function normalized(value: string | null | undefined): string {
  return stripAccents(value ?? "").trim().toUpperCase()
}

function parseSourceYear(value: number | string): number {
  const year = typeof value === "number" ? value : Number.parseInt(value, 10)
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error(`ANO_ELEICAO inválido: ${String(value)}`)
  }
  return year
}

export function electionYearFromDate(value: string | null | undefined): number | null {
  const date = (value ?? "").trim()
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date)
  if (br) {
    const day = Number(br[1])
    const month = Number(br[2])
    const year = Number(br[3])
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) return year
    return null
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(date)
  if (!iso) return null
  const year = Number(iso[1])
  const month = Number(iso[2])
  const day = Number(iso[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? year
    : null
}

/**
 * O ano do arquivo continua sendo a origem do download. Para publicação de
 * eleição suplementar, a data oficial do pleito define o ano apresentado.
 */
export function resolveEffectiveElectionContext(input: TseElectionContext): EffectiveElectionContext {
  const sourceYear = parseSourceYear(input.ano_eleicao)
  const supplementary = normalized(input.nm_tipo_eleicao).includes("ELEICAO SUPLEMENTAR")
  const dateYear = electionYearFromDate(input.dt_eleicao)
  return {
    sourceYear,
    effectiveYear: supplementary && dateYear != null ? dateYear : sourceYear,
    electionDate: input.dt_eleicao?.trim() || null,
    supplementary,
  }
}

export function effectiveElectionContextKey(input: {
  ano_eleicao: number | string
  dt_eleicao?: string | null
  nm_tipo_eleicao?: string | null
  sq_candidato: string
  uf: string
  cargo: string
}): string {
  const resolved = resolveEffectiveElectionContext(input)
  return [
    resolved.effectiveYear,
    input.sq_candidato.trim(),
    input.uf.trim().toUpperCase(),
    normalized(input.cargo),
  ].join("|")
}
