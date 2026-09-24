import "server-only"

import { unstableCacheWithSingleFlight } from "@/lib/cache-single-flight"
import { getDadosAbertosDataset, type DadosAbertosDataset } from "@/lib/dados-abertos"

const DADOS_ABERTOS_DATASET_REVALIDATE_SECONDS = 300

/**
 * Cacheia somente datasets que a consulta conseguiu montar por completo.
 * Rejeições continuam rejeições e não viram entradas vazias no Data Cache.
 * Os filtros entram como argumentos separados para compor a chave canônica.
 * Mesmo padrão de `imprensa-cache.ts`.
 */
const getCachedDadosAbertosDataset = unstableCacheWithSingleFlight(
  async (cargo: string | null, uf: string | null): Promise<DadosAbertosDataset> =>
    getDadosAbertosDataset({ cargo, uf }),
  ["dados-abertos-dataset-v1"],
  { revalidate: DADOS_ABERTOS_DATASET_REVALIDATE_SECONDS },
)

export function getDadosAbertosDatasetCached(filters: {
  cargo: string | null
  uf: string | null
}): Promise<DadosAbertosDataset> {
  return getCachedDadosAbertosDataset(filters.cargo, filters.uf)
}
