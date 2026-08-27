import "server-only"
import type { CandidatoSitesCollection } from "@/lib/types"

type Dataset = {
  election_year: number
  source: {
    resource_url: string
    resource_sha256: string
    collected_at: string
    generated_at_tse: string | null
  }
  candidates: Record<
    string,
    {
      sites: Array<{ order: number; url: string | null }>
    }
  >
}

let datasetPromise: Promise<Dataset> | null = null

function loadDataset(): Promise<Dataset> {
  datasetPromise ??= import("@/data/candidate-sites-tse-2026.json")
    .then((module) => module.default as Dataset)
  return datasetPromise
}

export async function getCandidateSitesTseBySlug(
  slug: string,
): Promise<CandidatoSitesCollection | null> {
  const dataset = await loadDataset()
  const sites = dataset.candidates[slug]?.sites
    .filter((site): site is { order: number; url: string } => Boolean(site.url))
    .map((site) => ({ ordem: site.order, url: site.url }))
  if (!sites?.length) return null

  return {
    ano_eleicao: dataset.election_year,
    fonte_url: dataset.source.resource_url,
    fonte_sha256: dataset.source.resource_sha256,
    coletado_em: dataset.source.collected_at,
    gerado_em_tse: dataset.source.generated_at_tse,
    sites,
  }
}
