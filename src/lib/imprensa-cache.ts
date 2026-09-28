import "server-only"

import { unstableCacheWithSingleFlight } from "@/lib/cache-single-flight"
import { getImprensaDataset, type ImprensaDataset, type ImprensaRow } from "@/lib/imprensa-data"
import { isSenadoEnabled } from "@/lib/senado-feature"

// 12 h, o mesmo frescor aceito para a ficha pública (APP_DATA_REVALIDATE_SECONDS
// em src/lib/api.ts, decisão de custo de 27/09/2026). A tag da ficha faz a
// escrita do pipeline (/api/revalidate) e o cron de 12 h invalidarem a Mesa, a
// Sala e os pacotes por UF junto com a ficha, sem cron nem TTL próprios.
const IMPRENSA_DATASET_REVALIDATE_SECONDS = 43200
const IMPRENSA_DATASET_TAG = "public-candidato-ficha"
// A flag do Senado faz parte da identidade de todo cache público (ver api.ts).
const SENADO_CACHE_VARIANT = isSenadoEnabled() ? "senado-on" : "senado-off"

export type ImprensaPageRow = Omit<ImprensaRow, "sites" | "processos" | "gastos"> & {
  sites: Omit<ImprensaRow["sites"], "ocorrencias">
  processos: Omit<ImprensaRow["processos"], "ocorrencias">
  gastos: Omit<ImprensaRow["gastos"], "anos">
}

export type ImprensaPageDataset = Omit<ImprensaDataset, "rows"> & {
  rows: ImprensaPageRow[]
}

function toPageDataset(dataset: ImprensaDataset): ImprensaPageDataset {
  return {
    ...dataset,
    rows: dataset.rows.map(({ sites, processos, gastos, ...row }) => {
      const { ocorrencias: sitesOccurrences, ...sitesSummary } = sites
      const { ocorrencias: processOccurrences, ...processesSummary } = processos
      const { anos: gastosAnos, ...gastosSummary } = gastos
      void sitesOccurrences
      void processOccurrences
      void gastosAnos
      return { ...row, sites: sitesSummary, processos: processesSummary, gastos: gastosSummary }
    }),
  }
}

/**
 * Cacheia somente datasets que a consulta conseguiu montar por completo.
 * Rejeições continuam rejeições e não viram entradas vazias no Data Cache.
 * Os filtros entram como argumentos separados para compor a chave canônica.
 */
const getCachedImprensaDataset = unstableCacheWithSingleFlight(
  async (cargo: string | null, uf: string | null): Promise<ImprensaPageDataset> =>
    toPageDataset(await getImprensaDataset({ cargo, uf })),
  ["imprensa-dataset-v6", SENADO_CACHE_VARIANT],
  { revalidate: IMPRENSA_DATASET_REVALIDATE_SECONDS, tags: [IMPRENSA_DATASET_TAG] },
)

export function getImprensaDatasetCached(filters: {
  cargo: string | null
  uf: string | null
}): Promise<ImprensaPageDataset> {
  return getCachedImprensaDataset(filters.cargo, filters.uf)
}
