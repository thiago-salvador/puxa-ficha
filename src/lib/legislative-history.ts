import type { HistoricoPolitico } from "@/lib/types"

const LEGISLATIVE_CARGO_PATTERNS = [
  /\bsenador\b/,
  /\bdeputad[oa]\b/,
  /\bvereador[ae]?\b/,
]

/**
 * Mandato com CEAP/CEAPS: senador ou deputado federal.
 * Não casa vereador, deputado estadual nem deputado distrital.
 * `/\bdeputad[oa]\b/` sozinho pegaria estadual; aqui "federal" é obrigatório.
 */
const FEDERAL_LEGISLATIVE_CARGO_PATTERNS = [
  /\bsenador[ae]?\b/,
  /\bdeputad[oa]\s+federal\b/,
]

function normalizeForCargoMatch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function matchesCargoPatterns(
  historico: readonly Pick<HistoricoPolitico, "cargo" | "cargo_canonico">[],
  patterns: readonly RegExp[],
) {
  return historico.some((row) => {
    const cargo = normalizeForCargoMatch(row.cargo)
    const cargoCanonico = normalizeForCargoMatch(row.cargo_canonico)
    return patterns.some((pattern) => pattern.test(cargo) || pattern.test(cargoCanonico))
  })
}

export function hasLegislativeHistory(historico: readonly Pick<HistoricoPolitico, "cargo" | "cargo_canonico">[]) {
  return matchesCargoPatterns(historico, LEGISLATIVE_CARGO_PATTERNS)
}

/** Senador ou deputado federal. Usado no comparador (bloco Congresso / CEAP). */
export function hasFederalLegislativeHistory(
  historico: readonly Pick<HistoricoPolitico, "cargo" | "cargo_canonico">[],
) {
  return matchesCargoPatterns(historico, FEDERAL_LEGISLATIVE_CARGO_PATTERNS)
}

/** Flags federais por candidato (comparador), a partir de um recorte barato de `historico_politico`. */
export function legislativeHistoryFlagsFromRows(
  rows: readonly {
    candidato_id: string
    cargo: string | null
    cargo_canonico?: string | null
  }[],
): Map<string, boolean> {
  const byId = new Map<string, Pick<HistoricoPolitico, "cargo" | "cargo_canonico">[]>()
  for (const row of rows) {
    const list = byId.get(row.candidato_id) ?? []
    list.push({ cargo: row.cargo ?? "", cargo_canonico: row.cargo_canonico ?? null })
    byId.set(row.candidato_id, list)
  }
  const flags = new Map<string, boolean>()
  for (const [id, historico] of byId) {
    flags.set(id, hasFederalLegislativeHistory(historico))
  }
  return flags
}
