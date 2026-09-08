import { formatCompact, formatCompactNumber, formatDecimal, formatPercent } from "@/lib/utils"

export interface StateIndicatorConfig {
  label: string
  format: (value: number) => string
  /** true = lower is better (homicidios, pobreza, desemprego, gini) */
  lowerIsBetter: boolean
  scale?: boolean
  glossary?: "Gini" | "PIB"
}

export const STATE_INDICATOR_CONFIG: Record<string, StateIndicatorConfig> = {
  homicidios_100k: {
    label: "Homicídios por 100 mil habitantes",
    format: (v) => formatDecimal(v, 1),
    lowerIsBetter: true,
  },
  pib_total: {
    scale: true,
    label: "PIB Total",
    glossary: "PIB",
    // O valor da fonte vem em milhares de reais.
    format: (v) => formatCompact(v * 1_000),
    lowerIsBetter: false,
  },
  populacao_estimada: {
    scale: true,
    label: "População",
    format: (v) => formatCompactNumber(v),
    lowerIsBetter: false,
  },
  gini: {
    label: "Índice de Gini",
    glossary: "Gini",
    format: (v) => formatDecimal(v, 3),
    lowerIsBetter: true,
  },
  taxa_desemprego: {
    label: "Taxa de Desemprego",
    format: (v) => formatPercent(v, 1),
    lowerIsBetter: true,
  },
  taxa_pobreza: {
    label: "Taxa de Pobreza",
    format: (v) => formatPercent(v, 1),
    lowerIsBetter: true,
  },
}

export const STATE_INDICATOR_ORDER = [
  "populacao_estimada",
  "pib_total",
  "taxa_desemprego",
  "taxa_pobreza",
  "homicidios_100k",
  "gini",
] as const

export function getStateIndicatorLowerIsBetter(indicador: string): boolean {
  return STATE_INDICATOR_CONFIG[indicador]?.lowerIsBetter ?? false
}

export function formatStateIndicatorFull(indicador: string, value: number): string {
  if (indicador === "pib_total") return `${formatDecimal(value * 1_000, 2)} reais`
  if (indicador === "populacao_estimada") return `${formatDecimal(value, 0)} habitantes`
  if (indicador === "homicidios_100k") return `${formatDecimal(value, 1)} homicídios por 100 mil habitantes`
  if (indicador === "gini") return `${formatDecimal(value, 3)} em uma escala de zero a um`
  if (indicador === "taxa_desemprego" || indicador === "taxa_pobreza") return `${formatDecimal(value, 1)} por cento`
  return formatDecimal(value, 1)
}

/** Ordem masculina por extenso para labels tipo "5o de 12" */
export function ordinalMasculino(n: number): string {
  return `${n}o`
}
