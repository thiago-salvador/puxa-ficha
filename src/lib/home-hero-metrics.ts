import type { DataSourceStatus } from "@/lib/types"

const HERO_CARGOS = new Set(["Presidente", "Governador"])

type HeroResumo = {
  patrimonio: number | null
  processos: number
  candidato: {
    cargo_disputado: string
  }
}

export type HomeHeroMetrics = {
  totalCandidatos: number | null
  totalPatrimonio: number | null
  totalProcessos: number | null
}

function recorteHero(resumos: HeroResumo[]): HeroResumo[] {
  return resumos.filter((resumo) =>
    HERO_CARGOS.has(resumo.candidato.cargo_disputado)
  )
}

export function getHomeHeroMetrics(
  resumos: HeroResumo[],
  sourceStatus: DataSourceStatus
): HomeHeroMetrics {
  const recorte = recorteHero(resumos)
  const totalCandidatos =
    sourceStatus === "live" || recorte.length > 0 ? recorte.length : null

  if (sourceStatus !== "live") {
    return {
      totalCandidatos,
      totalPatrimonio: null,
      totalProcessos: null,
    }
  }

  return {
    totalCandidatos,
    totalPatrimonio: recorte.reduce(
      (sum, resumo) => sum + (resumo.patrimonio ?? 0),
      0
    ),
    totalProcessos: recorte.reduce(
      (sum, resumo) => sum + resumo.processos,
      0
    ),
  }
}
