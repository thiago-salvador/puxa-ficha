import "server-only"
import type { CandidateSitesTseDataset, CandidatoSitesCollection } from "@/lib/types"

let datasetPromise: Promise<CandidateSitesTseDataset> | null = null

function loadDataset(): Promise<CandidateSitesTseDataset> {
  datasetPromise ??= import("@/data/candidate-sites-tse-2026.json")
    .then((module) => {
      const dataset = module.default as { schema_version?: unknown }
      if (dataset.schema_version !== 1) {
        throw new Error(`snapshot de sites do TSE incompativel: ${String(dataset.schema_version)}`)
      }
      return dataset as CandidateSitesTseDataset
    })
    .catch((error) => {
      datasetPromise = null
      throw error
    })
  return datasetPromise
}

export async function getCandidateSitesTseBySlug(
  slug: string,
): Promise<CandidatoSitesCollection | null> {
  const dataset = await loadDataset()
  const candidate = dataset.candidates[slug]
  const sites = candidate?.sites
    .filter((site): site is typeof site & { url: string } => Boolean(site.url))
    .map((site) => ({ ordem: site.order, url: site.url }))
  const vazioConfirmado = dataset.verified_empty_profiles.some((item) => item.slug === slug)
  if (!sites?.length && !candidate && !vazioConfirmado) return null

  return {
    ano_eleicao: dataset.election_year,
    fonte_url: dataset.source.resource_url,
    fonte_sha256: dataset.source.resource_sha256,
    coletado_em: dataset.source.collected_at,
    gerado_em_tse: dataset.source.generated_at_tse,
    resultado: sites?.length
      ? "publicado"
      : vazioConfirmado
        ? "vazio_confirmado"
        : "indeterminado",
    sites: sites ?? [],
  }
}
