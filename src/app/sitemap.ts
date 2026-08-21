import type { MetadataRoute } from "next"
import { rankingDefinitions } from "@/data/ranking-definitions"
import { getCandidatosResource, getEstadoUFs } from "@/lib/api"
import { parseMetadataDate, SITE_ORIGIN } from "@/lib/metadata"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let candidatoUrls: MetadataRoute.Sitemap = []
  try {
    const candidatos = (await getCandidatosResource()).data
    candidatoUrls = candidatos.flatMap((c) => {
      const lastModified = parseMetadataDate(c.ultima_atualizacao) ?? new Date()
      return [
        {
          url: `${SITE_ORIGIN}/candidato/${c.slug}`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        },
        {
          // A linha do tempo tem canonical e OG image próprios, então merece
          // entrada própria no sitemap, com prioridade menor que a ficha.
          url: `${SITE_ORIGIN}/candidato/${c.slug}/timeline`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.5,
        },
      ]
    })
  } catch {
    // Supabase indisponível: retorna sitemap estático sem candidatos
  }

  const ufs = getEstadoUFs()
  const rankingUrls = rankingDefinitions.map((definition) => ({
    url: `${SITE_ORIGIN}/rankings/${definition.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.65,
  }))

  const ufUrls = ufs.map((uf) => ({
    url: `${SITE_ORIGIN}/uf/${uf}`,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  return [
    {
      url: SITE_ORIGIN,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_ORIGIN}/comparar`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      // Página geradora do widget (/embed nua). O robots.txt bloqueia apenas
      // "/embed/", ou seja, o widget em si, e não esta página pública.
      url: `${SITE_ORIGIN}/embed`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_ORIGIN}/doadores`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${SITE_ORIGIN}/governadores`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_ORIGIN}/parlamentares`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_ORIGIN}/rankings`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_ORIGIN}/quiz`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_ORIGIN}/quiz/metodologia`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_ORIGIN}/metodologia`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_ORIGIN}/sobre`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/privacidade`,
      changeFrequency: "monthly",
      priority: 0.2,
    },
    {
      url: `${SITE_ORIGIN}/termos`,
      changeFrequency: "monthly",
      priority: 0.2,
    },
    ...candidatoUrls,
    ...rankingUrls,
    ...ufUrls,
  ]
}
