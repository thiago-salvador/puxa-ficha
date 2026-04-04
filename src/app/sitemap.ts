import type { MetadataRoute } from "next"
import { getCandidatosResource, getEstadoUFs } from "@/lib/api"
import { parseMetadataDate } from "@/lib/metadata"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const candidatos = (await getCandidatosResource()).data
  const ufs = getEstadoUFs()

  const candidatoUrls = candidatos.map((c) => ({
    url: `https://puxaficha.com.br/candidato/${c.slug}`,
    lastModified: parseMetadataDate(c.ultima_atualizacao) ?? new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  const ufUrls = ufs.map((uf) => ({
    url: `https://puxaficha.com.br/governadores/${uf}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  return [
    {
      url: "https://puxaficha.com.br",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://puxaficha.com.br/comparar",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://puxaficha.com.br/governadores",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://puxaficha.com.br/sobre",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    ...candidatoUrls,
    ...ufUrls,
  ]
}
