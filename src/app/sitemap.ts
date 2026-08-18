import type { MetadataRoute } from "next"
import { rankingDefinitions } from "@/data/ranking-definitions"
import { getCandidatosResource, getEstadoUFs } from "@/lib/api"
import { parseMetadataDate } from "@/lib/metadata"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let candidatoUrls: MetadataRoute.Sitemap = []
  try {
    const candidatos = (await getCandidatosResource()).data
    candidatoUrls = candidatos.flatMap((c) => {
      const lastModified = parseMetadataDate(c.ultima_atualizacao) ?? new Date()
      return [
        {
          url: `https://puxaficha.com.br/candidato/${c.slug}`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        },
        {
          // A linha do tempo tem canonical e OG image próprios, então merece
          // entrada própria no sitemap, com prioridade menor que a ficha.
          url: `https://puxaficha.com.br/candidato/${c.slug}/timeline`,
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
    url: `https://puxaficha.com.br/rankings/${definition.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.65,
  }))

  const ufUrls = ufs.map((uf) => ({
    url: `https://puxaficha.com.br/uf/${uf}`,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  return [
    {
      url: "https://puxaficha.com.br",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://puxaficha.com.br/comparar",
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      // Página geradora do widget (/embed nua). O robots.txt bloqueia apenas
      // "/embed/", ou seja, o widget em si, e não esta página pública.
      url: "https://puxaficha.com.br/embed",
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://puxaficha.com.br/doadores",
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: "https://puxaficha.com.br/governadores",
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://puxaficha.com.br/parlamentares",
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://puxaficha.com.br/rankings",
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://puxaficha.com.br/quiz",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://puxaficha.com.br/quiz/metodologia",
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://puxaficha.com.br/metodologia",
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://puxaficha.com.br/sobre",
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: "https://puxaficha.com.br/privacidade",
      changeFrequency: "monthly",
      priority: 0.2,
    },
    {
      url: "https://puxaficha.com.br/termos",
      changeFrequency: "monthly",
      priority: 0.2,
    },
    ...candidatoUrls,
    ...rankingUrls,
    ...ufUrls,
  ]
}
