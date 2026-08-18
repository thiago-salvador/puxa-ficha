import { canonicalCargo } from "./cargo-utils"

export type HistoricoRowMatchInput = {
  id: string
  cargo: string
  cargo_canonico?: string | null
  periodo_inicio: number | null
  periodo_fim?: number | null
  /** Campos opcionais: presentes na linha do `select` de `ensureHistorico`; não entram na chave de match. */
  partido?: string | null
  estado?: string | null
  eleito_por?: string | null
  observacoes?: string | null
  tipo_evento?: string | null
  proveniencia?: string | null
}

export type HistoricoFixMatchInput = {
  cargo: string
  periodo_inicio: number
  periodo_fim: number | null
}

/** Alinha à UNIQUE `(candidato_id, cargo_canonico, periodo_inicio)` quando `cargo` difere só por acento/variante. */
function resolvedCargoCanonico(row: Pick<HistoricoRowMatchInput, "cargo" | "cargo_canonico">): string {
  const stored = row.cargo_canonico?.trim()
  if (stored) return stored
  return canonicalCargo(row.cargo)
}

/**
 * Encontra linha existente para upsert idempotente de `historicoFix`.
 * Ordem: match exato (cargo + início + fim) → mesma chave “legada” (cargo + início) → mesmo par da UNIQUE (início + cargo_canonico efetivo).
 */
export function findHistoricoRowForFix(
  historico: HistoricoRowMatchInput[],
  fix: HistoricoFixMatchInput
): HistoricoRowMatchInput | undefined {
  const cargoCanonicoFix = canonicalCargo(fix.cargo)

  const exactMatch = historico.find(
    (row) =>
      row.cargo === fix.cargo &&
      row.periodo_inicio === fix.periodo_inicio &&
      (row.periodo_fim ?? null) === (fix.periodo_fim ?? null)
  )
  if (exactMatch) return exactMatch

  const uniqueKeyMatch = historico.find(
    (row) => row.cargo === fix.cargo && row.periodo_inicio === fix.periodo_inicio
  )
  if (uniqueKeyMatch) return uniqueKeyMatch

  return historico.find(
    (row) =>
      row.periodo_inicio === fix.periodo_inicio && resolvedCargoCanonico(row) === cargoCanonicoFix
  )
}
