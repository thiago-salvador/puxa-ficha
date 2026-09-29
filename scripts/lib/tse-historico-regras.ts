/**
 * Regras do TSE para o histórico eleitoral, sem banco nem rede.
 *
 * Moram aqui para que o ingest (`ingest-tse-historico.ts`) e a revisão
 * agendada do histórico (`scripts/audit/lib/historico-revisao.ts`) leiam a
 * mesma regra: se o ingest omite uma candidatura, a revisão não pode cobrar
 * essa mesma candidatura como ausente da ficha.
 */

export function parseEleitoStatus(dsSitTotTurno: string): { eleito: boolean; descricao: string } {
  const upper = (dsSitTotTurno || "").trim().toUpperCase()
  // "NÃO ELEITO" contains "ELEITO" — must check negatives first
  const naoEleitoTerms = ["NAO ELEITO", "NÃO ELEITO", "NULO", "#NULO#", "INDEFERIDO", "RENÚNCIA", "RENUNCIA", "CASSADO", "FALECIDO", "2º TURNO", "2O TURNO", "SUPLENTE"]
  if (!upper || naoEleitoTerms.some((t) => upper.includes(t))) {
    return { eleito: false, descricao: dsSitTotTurno.trim() || "Resultado não informado" }
  }
  const eleitoTerms = ["ELEITO", "ELEITO POR QP", "ELEITO POR MEDIA", "MEDIA"]
  const isEleito = eleitoTerms.some((t) => upper.includes(t))
  return { eleito: isEleito, descricao: dsSitTotTurno.trim() || "Resultado não informado" }
}

/** Não persistir em historico (decisão editorial): sem pleito válido ou registro cassado/falecido. */
export function shouldOmitFromHistoricoDescricao(descricao: string): boolean {
  const u = descricao.toUpperCase()
  return (
    u.includes("INDEFERIDO") ||
    u.includes("#NULO#") ||
    u.includes("RENÚNCIA") ||
    u.includes("RENUNCIA") ||
    u.includes("CASSADO") ||
    u.includes("FALECIDO")
  )
}
