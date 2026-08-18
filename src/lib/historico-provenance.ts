/**
 * Proveniência estruturada por row em `historico_politico`.
 *
 * Coluna opcional `proveniencia` no Postgres (ver migração); quando NULL, consumidores
 * usam `resolveHistoricoRowProvenance` → fallback `inferHistoricoObsSource(observacoes)`.
 *
 * `observacoes` permanece texto editorial; não é fonte única de verdade quando `proveniencia` está preenchida.
 */

/** Valores inferíveis só a partir de `observacoes` (heurística por substring). Nunca retorna `misto`. */
export type HistoricoInferredSource = "tse" | "wikidata" | "manual" | "unknown"

/** Valores persistíveis na coluna `historico_politico.proveniencia` + resultado de `resolveHistoricoRowProvenance`. */
export type HistoricoRowProvenance = HistoricoInferredSource | "misto"

const HISTORICO_ROW_PROVENIENCIA_VALUES: readonly HistoricoRowProvenance[] = [
  "tse",
  "wikidata",
  "manual",
  "misto",
  "unknown",
]

function isHistoricoRowProvenanceColumn(
  value: string | null | undefined,
): value is HistoricoRowProvenance {
  return value != null && HISTORICO_ROW_PROVENIENCIA_VALUES.includes(value as HistoricoRowProvenance)
}

/**
 * Heurística legada por substring em `observacoes` (ordem: TSE antes de Wikidata).
 * Não retorna `misto` — mistura explícita só via coluna estruturada.
 */
export function inferHistoricoObsSource(obs: string | null): HistoricoInferredSource {
  if (obs == null || obs.trim() === "") return "manual"
  const u = obs.toUpperCase()
  if (u.includes("TSE")) return "tse"
  if (u.includes("WIKIDATA") || u.includes("IMPORTADO AUTOMATICAMENTE")) return "wikidata"
  return "manual"
}

/**
 * Proveniência efetiva da row: coluna estruturada quando válida; senão inferência legada.
 */
export function resolveHistoricoRowProvenance(row: {
  observacoes?: string | null
  proveniencia?: string | null
}): HistoricoRowProvenance {
  if (isHistoricoRowProvenanceColumn(row.proveniencia)) {
    return row.proveniencia
  }
  return inferHistoricoObsSource(row.observacoes ?? null)
}
