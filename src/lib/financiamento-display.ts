import type { Financiamento } from "@/lib/types"
import type { FinancingBreakdownKey } from "@/lib/ui-labels"

export interface FinancingCompositionSegment {
  key: FinancingBreakdownKey
  value: number
}

export interface FinancingComposition {
  segments: FinancingCompositionSegment[]
  knownTotal: number
  residual: number
  overage: number
  chartIsSafe: boolean
}

const CENT_TOLERANCE = 0.01

function nonNegative(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

/**
 * Reconcilia a decomposição pública com o total oficial da prestação.
 *
 * O banco legado só tem quatro categorias explícitas. Quando elas somam menos
 * que o total, a diferença não pode desaparecer do gráfico: ela vira "Outras
 * origens registradas no TSE". Se somam mais, o gráfico é bloqueado porque
 * percentuais sobre uma composição contraditória seriam enganosos.
 */
export function buildFinancingComposition(item: Financiamento): FinancingComposition {
  const official = item.categorias_origem
  const hasOfficialComposition = official && Object.keys(official).length > 0
  const officialOther = hasOfficialComposition
    ? nonNegative(official.outros_recursos) + nonNegative(official.nao_informado_pelo_tse)
    : 0
  const base: FinancingCompositionSegment[] = hasOfficialComposition
    ? [
        { key: "fundo_eleitoral", value: nonNegative(official.fundo_eleitoral) },
        { key: "fundo_partidario", value: nonNegative(official.fundo_partidario) },
        { key: "outros_recursos", value: officialOther },
      ]
    : [
        { key: "fundo_eleitoral", value: nonNegative(item.total_fundo_eleitoral) },
        { key: "fundo_partidario", value: nonNegative(item.total_fundo_partidario) },
        { key: "pessoa_fisica", value: nonNegative(item.total_pessoa_fisica) },
        { key: "recursos_proprios", value: nonNegative(item.total_recursos_proprios) },
      ]
  const total = nonNegative(item.total_arrecadado)
  const knownTotal = base.reduce((sum, segment) => sum + segment.value, 0)
  const difference = total - knownTotal
  const residual = difference > CENT_TOLERANCE ? difference : 0
  const overage = difference < -CENT_TOLERANCE ? Math.abs(difference) : 0
  const segments = residual > 0 && !hasOfficialComposition
    ? [...base, { key: "outros_recursos" as const, value: residual }]
    : base

  return {
    segments,
    knownTotal,
    residual,
    overage,
    chartIsSafe: overage === 0 && (!hasOfficialComposition || residual === 0),
  }
}
