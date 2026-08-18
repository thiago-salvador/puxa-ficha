import { formatCompactNumber, formatDecimal, formatPercent } from "@/lib/utils"

export interface StateIndicatorConfig {
  label: string
  format: (value: number) => string
  /** true = lower is better (homicidios, pobreza, desemprego, gini) */
  lowerIsBetter: boolean
}

export const STATE_INDICATOR_CONFIG: Record<string, StateIndicatorConfig> = {
  homicidios_100k: {
    label: "Homicídios por 100k hab.",
    format: (v) => formatDecimal(v, 1),
    lowerIsBetter: true,
  },
  pib_total: {
    label: "PIB Total",
    // O valor da fonte vem em milhares de reais.
    format: (v) => {
      const billions = v / 1_000_000
      if (billions >= 1) return `R$ ${formatDecimal(billions, 0)} bi`
      const millions = v / 1_000
      return `R$ ${formatDecimal(millions, 0)} mi`
    },
    lowerIsBetter: false,
  },
  populacao_estimada: {
    label: "População",
    format: (v) => formatCompactNumber(v),
    lowerIsBetter: false,
  },
  gini: {
    label: "Índice de Gini",
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

/** Ordem masculina por extenso para labels tipo "5o de 12" */
export function ordinalMasculino(n: number): string {
  return `${n}o`
}
