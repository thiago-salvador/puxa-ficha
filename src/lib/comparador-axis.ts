export type ComparadorEixo = "patrimonio" | "gastos"

export const COMPARADOR_EIXOS: ComparadorEixo[] = ["patrimonio", "gastos"]

export const COMPARADOR_EIXO_DEFAULT: ComparadorEixo = "patrimonio"

function parseComparadorEixo(raw: string | null | undefined): ComparadorEixo | null {
  if (!raw || typeof raw !== "string") return null
  const v = raw.trim().toLowerCase()
  if (v === "patrimonio" || v === "patrimônio") return "patrimonio"
  if (v === "gastos") return "gastos"
  return null
}

export function normalizeComparadorEixo(raw: string | null | undefined): ComparadorEixo {
  return parseComparadorEixo(raw) ?? COMPARADOR_EIXO_DEFAULT
}

export const comparadorEixoLabels: Record<ComparadorEixo, string> = {
  patrimonio: "Patrimônio",
  gastos: "Cota parlamentar",
}

export const comparadorEixoShortLabels: Record<ComparadorEixo, string> = {
  patrimonio: "Patrimônio",
  gastos: "Cota",
}

/** Texto curto para OG / metadata. */
export const comparadorEixoOgSubtitle: Record<ComparadorEixo, string> = {
  patrimonio: "Última declaração disponível no Puxa Ficha.",
  gastos:
    "Soma da cota parlamentar (CEAP/CEAPS) nos anos disponíveis. Presidência e governo estadual não entram.",
}
