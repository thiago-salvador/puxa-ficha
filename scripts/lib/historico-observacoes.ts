/**
 * Marca observações de historico_politico que indicam anomalia TSE/editorial
 * (indeferido, nulo, renúncia do próprio mandato/candidatura, cassação, óbito).
 *
 * "Renúncia de [outra pessoa]" (sucessão) não deve bloquear — não é linha de mandato inválido.
 */
export function observacoesHistoricoProblematicas(obs: string | null): boolean {
  if (obs == null || !obs.trim()) return false
  const u = obs.toUpperCase()
  if (
    u.includes("INDEFERID") ||
    u.includes("#NULO") ||
    u.includes("CASSADO") ||
    u.includes("CASSADA") ||
    u.includes("FALECIDO") ||
    u.includes("FALECIDA")
  ) {
    return true
  }

  const n = obs
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  // Sucessão: "após renúncia de Fulano", "renúncia de Gladson Cameli", etc.
  if (/\brenuncia\s+de\s+/.test(n)) {
    return false
  }

  if (/\brenuncia\b.*\bpara\b.*\b(disput\w*|concorr\w*|candidat\w*)\b/.test(n)) {
    return false
  }

  if (n.includes("renuncia")) {
    return true
  }

  return false
}

export function observacaoHistoricoRequerRevisao(
  row: { observacoes: string | null; tipo_evento?: string | null; periodo_fim?: number | null },
  currentYear = new Date().getFullYear(),
): boolean {
  const obs = row.observacoes
  if (!observacoesHistoricoProblematicas(obs)) return false
  const normalized = (obs ?? "").toUpperCase()

  if (normalized.includes("#NULO")) return true
  if (row.tipo_evento === "candidatura" && normalized.includes("INDEFERID")) return false
  if (row.periodo_fim != null && row.periodo_fim <= currentYear) return false

  return true
}
