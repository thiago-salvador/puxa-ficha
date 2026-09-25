import "server-only"

import { unstableCacheWithSingleFlight } from "@/lib/cache-single-flight"
import { getImprensaDataset, type ImprensaDataset, type ImprensaRow } from "@/lib/imprensa-data"

const IMPRENSA_DATASET_REVALIDATE_SECONDS = 300

export type ImprensaPageRow = Omit<ImprensaRow, "sites" | "processos"> & {
  sites: Omit<ImprensaRow["sites"], "ocorrencias">
  processos: Omit<ImprensaRow["processos"], "ocorrencias">
}

export type ImprensaPageDataset = Omit<ImprensaDataset, "rows"> & {
  rows: ImprensaPageRow[]
}

function toPageDataset(dataset: ImprensaDataset): ImprensaPageDataset {
  return {
    ...dataset,
    rows: dataset.rows.map(({ sites, processos, ...row }) => {
      const { ocorrencias: sitesOccurrences, ...sitesSummary } = sites
      const { ocorrencias: processOccurrences, ...processesSummary } = processos
      void sitesOccurrences
      void processOccurrences
      return { ...row, sites: sitesSummary, processos: processesSummary }
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
  ["imprensa-dataset-v3"],
  { revalidate: IMPRENSA_DATASET_REVALIDATE_SECONDS },
)

export function getImprensaDatasetCached(filters: {
  cargo: string | null
  uf: string | null
}): Promise<ImprensaPageDataset> {
  return getCachedImprensaDataset(filters.cargo, filters.uf)
}
