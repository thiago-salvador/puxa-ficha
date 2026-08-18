/**
 * Classificação editorial: mandato (cargo/posição) vs candidatura (pleito sem mandato naquele registo).
 * Usar quando `tipo_evento` na base for NULL (legado) ou para inferir em escritas pontuais.
 */

export type HistoricoTipoEvento = "mandato" | "candidatura"

export type HistoricoTipoEventoRow = {
  tipo_evento?: string | null
  observacoes?: string | null
  periodo_inicio?: number | null
  periodo_fim?: number | null
}

export function inferHistoricoTipoEventoFromRow(row: HistoricoTipoEventoRow): HistoricoTipoEvento {
  const t = row.tipo_evento?.trim()
  if (t === "candidatura" || t === "mandato") return t

  const obs = (row.observacoes || "").trim()
  if (obs.toLowerCase().startsWith("candidatura:")) return "candidatura"

  if (
    row.periodo_inicio != null &&
    row.periodo_fim != null &&
    row.periodo_inicio === row.periodo_fim &&
    obs.toLowerCase().includes("tse")
  ) {
    return "candidatura"
  }

  return "mandato"
}

export function isHistoricoCandidaturaRow(row: HistoricoTipoEventoRow): boolean {
  return inferHistoricoTipoEventoFromRow(row) === "candidatura"
}
