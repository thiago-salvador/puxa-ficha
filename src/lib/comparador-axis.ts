export type ComparadorEixo = "patrimonio" | "votos" | "gastos"

export const COMPARADOR_EIXOS: ComparadorEixo[] = ["patrimonio", "votos", "gastos"]

export const COMPARADOR_EIXO_DEFAULT: ComparadorEixo = "patrimonio"

function parseComparadorEixo(raw: string | null | undefined): ComparadorEixo | null {
  if (!raw || typeof raw !== "string") return null
  const v = raw.trim().toLowerCase()
  if (v === "patrimonio" || v === "patrimônio") return "patrimonio"
  if (v === "votos" || v === "votacoes" || v === "votações") return "votos"
  if (v === "gastos") return "gastos"
  return null
}

export function normalizeComparadorEixo(raw: string | null | undefined): ComparadorEixo {
  return parseComparadorEixo(raw) ?? COMPARADOR_EIXO_DEFAULT
}

export const comparadorEixoLabels: Record<ComparadorEixo, string> = {
  patrimonio: "Patrimônio",
  votos: "Votações",
  gastos: "Gastos parlamentares",
}

export const comparadorEixoShortLabels: Record<ComparadorEixo, string> = {
  patrimonio: "Patrimônio",
  votos: "Votações",
  gastos: "Gastos",
}

/** Texto curto para OG / metadata. */
export const comparadorEixoOgSubtitle: Record<ComparadorEixo, string> = {
  patrimonio: "Última declaração disponível no Puxa Ficha.",
  votos: "Votações Chave com registro de voto no Puxa Ficha.",
  gastos: "Soma de gastos parlamentares registrados no Puxa Ficha.",
}
