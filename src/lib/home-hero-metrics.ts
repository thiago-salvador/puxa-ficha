import type { DataSourceStatus } from "@/lib/types"

type HeroResumo = {
  patrimonio: number | null
  processos: number
}

export type HomeHeroMetrics = {
  totalCandidatos: number | null
  totalPatrimonio: number | null
  totalProcessos: number | null
}

export function getHomeHeroMetrics(
  resumos: HeroResumo[],
  sourceStatus: DataSourceStatus
): HomeHeroMetrics {
  const totalCandidatos =
    sourceStatus === "live" || resumos.length > 0 ? resumos.length : null

  if (sourceStatus !== "live") {
    return {
      totalCandidatos,
      totalPatrimonio: null,
      totalProcessos: null,
    }
  }

  return {
    totalCandidatos,
    totalPatrimonio: resumos.reduce(
      (sum, resumo) => sum + (resumo.patrimonio ?? 0),
      0
    ),
    totalProcessos: resumos.reduce(
      (sum, resumo) => sum + resumo.processos,
      0
    ),
  }
}
