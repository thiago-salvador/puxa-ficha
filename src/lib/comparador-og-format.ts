import type { ComparadorEixo } from "@/lib/comparador-axis"
import { comparadorEixoShortLabels } from "@/lib/comparador-axis"
import { COMPARADOR_NAO_SE_APLICA } from "@/lib/comparador-display"
import type { CandidatoComparavel } from "@/lib/types"
import { formatCompact } from "@/lib/utils"

export function formatComparadorMetricForOg(
  eixo: ComparadorEixo,
  candidato: CandidatoComparavel
): string {
  switch (eixo) {
    case "patrimonio":
      return candidato.patrimonio_declarado != null && candidato.patrimonio_declarado > 0
        ? formatCompact(candidato.patrimonio_declarado)
        : "Sem dado"
    case "gastos":
      return candidato.total_gasto_parlamentar != null && candidato.total_gasto_parlamentar > 0
        ? formatCompact(candidato.total_gasto_parlamentar)
        : COMPARADOR_NAO_SE_APLICA
    default:
      return "Sem dado"
  }
}

export function comparadorOgMetricLabel(eixo: ComparadorEixo): string {
  return comparadorEixoShortLabels[eixo]
}
