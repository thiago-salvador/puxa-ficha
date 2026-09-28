import "server-only"

import { CURRENT_DATA_WAVE } from "@/lib/api"
import { unstableCacheWithSingleFlight } from "@/lib/cache-single-flight"
import {
  filterDadosAbertosDataset,
  getDadosAbertosDataset,
  type DadosAbertosDataset,
  type DadosAbertosFilters,
} from "@/lib/dados-abertos"
import { isSenadoEnabled } from "@/lib/senado-feature"

// Mesmo frescor da ficha pública (APP_DATA_REVALIDATE_SECONDS em src/lib/api.ts,
// decisão de 27/09/2026). A tag `public-candidatos` faz a escrita do pipeline
// (POST /api/revalidate) e o cron de 12 h renovarem esta entrada junto com o
// resto do cadastro.
const DADOS_ABERTOS_DATASET_REVALIDATE_SECONDS = 43200
// A flag do Senado muda quais linhas são expostas; entra na identidade do cache.
const SENADO_CACHE_VARIANT = isSenadoEnabled() ? "senado-on" : "senado-off"

/**
 * Cacheia uma única entrada: o cadastro inteiro, sem filtro. Cargo e UF são
 * aplicados em memória por `filterDadosAbertosDataset`, então parâmetros
 * arbitrários na URL não multiplicam entradas no Data Cache. Rejeições
 * continuam rejeições e não viram entradas vazias.
 */
const getCachedFullDadosAbertosDataset = unstableCacheWithSingleFlight(
  async (): Promise<DadosAbertosDataset> => getDadosAbertosDataset({ cargo: null, uf: null }),
  ["dados-abertos-dataset-v2", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  { revalidate: DADOS_ABERTOS_DATASET_REVALIDATE_SECONDS, tags: ["public-candidatos"] },
)

export async function getDadosAbertosDatasetCached(filters: DadosAbertosFilters): Promise<DadosAbertosDataset> {
  return filterDadosAbertosDataset(await getCachedFullDadosAbertosDataset(), filters)
}
