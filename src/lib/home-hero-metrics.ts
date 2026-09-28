import { shouldExposeCargo } from "@/lib/senado-feature"
import type { DataSourceStatus } from "@/lib/types"

// Titulares apenas: vices ficam fora. Senador entra só com SENADO_ENABLED ligada.
// A chave ignora caixa e espaços: o TSE devolve cargo em CAIXA ALTA.
const HERO_CARGOS = new Map([
  ["presidente", "Presidente"],
  ["governador", "Governador"],
  ["senador", "Senador"],
])

function heroCargo(cargo: string): string | undefined {
  return HERO_CARGOS.get(cargo.trim().toLocaleLowerCase("pt-BR"))
}

type HeroResumo = {
  patrimonio: number | null
  processos: number
  candidato: {
    cargo_disputado: string
    estado?: string | null
  }
}

/**
 * UFs distintas no mesmo recorte do total da home (Presidente não tem UF).
 * Fonte degradada e vazia devolve null: falha de consulta não vira zero.
 */
export function getHomeHeroUfCount(
  resumos: HeroResumo[],
  sourceStatus: DataSourceStatus,
  env: Record<string, string | undefined> = process.env
): number | null {
  const recorte = recorteHero(resumos, env)
  if (sourceStatus !== "live" && recorte.length === 0) return null
  return new Set(
    recorte
      .map((resumo) => resumo.candidato.estado?.trim().toUpperCase())
      .filter((uf): uf is string => Boolean(uf))
  ).size
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
  return resumos.filter((resumo) => {
    const cargo = heroCargo(resumo.candidato.cargo_disputado)
    return cargo !== undefined && shouldExposeCargo(cargo, env)
  })
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
