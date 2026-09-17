import { shouldExposeCargo } from "@/lib/senado-feature"
import type { DataSourceStatus } from "@/lib/types"

// Titulares apenas: vices ficam fora. Senador entra só com SENADO_ENABLED ligada.
const HERO_CARGOS = new Set(["Presidente", "Governador", "Senador"])

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

function recorteHero(
  resumos: HeroResumo[],
  env: Record<string, string | undefined>
): HeroResumo[] {
  return resumos.filter(
    (resumo) =>
      HERO_CARGOS.has(resumo.candidato.cargo_disputado) &&
      shouldExposeCargo(resumo.candidato.cargo_disputado, env)
  )
}

export function getHomeHeroMetrics(
  resumos: HeroResumo[],
  sourceStatus: DataSourceStatus,
  env: Record<string, string | undefined> = process.env
): HomeHeroMetrics {
  const recorte = recorteHero(resumos, env)
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
