import type { CandidatoResumo } from "@/lib/api"

export interface CandidatoGridMaps {
  processos: Record<string, number>
  patrimonios: Record<string, number | null>
  processSortCounts: Record<string, number | null>
  /** Só slugs marcados; ausência vale como não atípico. */
  patrimoniosAtipicos: Record<string, boolean>
}

/**
 * Mapas por slug que as páginas de lista repassam à `CandidatoGrid`, montados a
 * partir do DTO de lista. Centraliza a fiação para que o aviso de patrimônio
 * atípico (F3) chegue igual à home, a /uf/[uf] e a /uf/[uf]/senado.
 */
export function buildCandidatoGridMaps(resumos: readonly CandidatoResumo[]): CandidatoGridMaps {
  const maps: CandidatoGridMaps = {
    processos: {},
    patrimonios: {},
    processSortCounts: {},
    patrimoniosAtipicos: {},
  }
  for (const resumo of resumos) {
    const slug = resumo.candidato.slug
    maps.processos[slug] = resumo.processos
    maps.patrimonios[slug] = resumo.patrimonio
    maps.processSortCounts[slug] = resumo.processos_ordenacao ?? null
    if (resumo.patrimonio_atipico) maps.patrimoniosAtipicos[slug] = true
  }
  return maps
}
