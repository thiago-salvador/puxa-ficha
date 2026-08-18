import type { HistoricoPolitico } from "@/lib/types"

const LEGISLATIVE_CARGO_PATTERNS = [
  /\bsenador\b/,
  /\bdeputad[oa]\b/,
  /\bvereador[ae]?\b/,
]

function normalizeForCargoMatch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

export function hasLegislativeHistory(historico: readonly Pick<HistoricoPolitico, "cargo" | "cargo_canonico">[]) {
  return historico.some((row) => {
    const cargo = normalizeForCargoMatch(row.cargo)
    const cargoCanonico = normalizeForCargoMatch(row.cargo_canonico)
    return LEGISLATIVE_CARGO_PATTERNS.some(
      (pattern) => pattern.test(cargo) || pattern.test(cargoCanonico)
    )
  })
}
