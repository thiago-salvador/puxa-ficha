import "server-only"

import { unstableCacheWithSingleFlight } from "@/lib/cache-single-flight"
import { getCorrecoesRecentes, type CorrecaoRecente } from "@/lib/correcoes-recentes"

const CORRECOES_RECENTES_REVALIDATE_SECONDS = 300

/**
 * Mesmo padrão de `imprensa-cache.ts`/`dados-abertos-cache.ts`: cacheia só
 * consultas que terminaram por completo, e rejeições continuam rejeições.
 */
export const getCorrecoesRecentesCached = unstableCacheWithSingleFlight(
  async (limit: number): Promise<CorrecaoRecente[]> => getCorrecoesRecentes(limit),
  ["correcoes-recentes-v1"],
  { revalidate: CORRECOES_RECENTES_REVALIDATE_SECONDS },
)
