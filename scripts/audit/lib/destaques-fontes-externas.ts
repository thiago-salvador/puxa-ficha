export interface CandidaturaTseAuditada {
  ano: number
  sq: string
  identidade: "confirmada" | "nao_localizada" | "ambigua"
  resultadoEleitoral: string | null
  declarouBens: string | null
  bens: number
  valorTotal: number
}

export type ResultadoFonteAuditada =
  | "encontrado"
  | "vazio_confirmado"
  | "sem_achado_no_escopo"
  | "indeterminado"
  | "nao_coletado"

const RESULTADOS_NAO_ELEITOS = [
  "NAO ELEITO",
  "NÃO ELEITO",
  "SUPLENTE",
  "2º TURNO",
  "2O TURNO",
  "INDEFERIDO",
  "RENÚNCIA",
  "RENUNCIA",
  "CASSADO",
  "FALECIDO",
  "NULO",
]

export function resultadoEleitoralEhEleito(valor: string | null): boolean {
  const normalizado = (valor ?? "").trim().toUpperCase()
  if (!normalizado || RESULTADOS_NAO_ELEITOS.some((termo) => normalizado.includes(termo))) {
    return false
  }
  return normalizado.includes("ELEITO") || normalizado.includes("MÉDIA") || normalizado.includes("MEDIA")
}

/**
 * O pacote consulta_cand prova somente as candidaturas identificadas por SQ.
 * Sem eleito, o desfecho é deliberadamente limitado ao escopo, nunca ausência
 * integral de trajetória pública.
 */
export function classificarTrajetoriaTse(
  candidaturas: readonly CandidaturaTseAuditada[],
): ResultadoFonteAuditada {
  if (candidaturas.length === 0) return "nao_coletado"
  if (candidaturas.some((item) => item.identidade !== "confirmada")) return "indeterminado"
  if (candidaturas.some((item) => resultadoEleitoralEhEleito(item.resultadoEleitoral))) {
    return "encontrado"
  }
  return "sem_achado_no_escopo"
}

/**
 * A ausência de linhas no bem_candidato só fecha uma célula quando a própria
 * linha identificada de consulta_cand declara ST_DECLARAR_BENS=N. Pacote vazio
 * sem esse marcador continua inconclusivo.
 */
export function classificarPatrimonioTse(
  candidaturas: readonly CandidaturaTseAuditada[],
): ResultadoFonteAuditada {
  if (candidaturas.length === 0) return "nao_coletado"
  if (candidaturas.some((item) => item.identidade !== "confirmada")) return "indeterminado"
  if (candidaturas.some((item) => item.bens > 0)) return "encontrado"
  const todasDeclararamAusencia = candidaturas.every(
    (item) => (item.declarouBens ?? "").trim().toUpperCase() === "N",
  )
  return todasDeclararamAusencia ? "vazio_confirmado" : "indeterminado"
}

export function parseValorTse(valor: string | null | undefined): number {
  const normalizado = (valor ?? "0")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
  const numero = Number.parseFloat(normalizado)
  return Number.isFinite(numero) ? numero : 0
}
