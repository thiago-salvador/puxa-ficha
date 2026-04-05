import { getRankingDefinitionBySlug } from "@/data/ranking-definitions"
import { getRankingDataResource } from "@/lib/api"
import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"
import { formatRankingMetricValue } from "@/lib/rankings"

export const size = ogSize
export const contentType = ogContentType

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const definition = getRankingDefinitionBySlug(slug)

  if (!definition) {
    return buildEditorialOg({
      eyebrow: "Rankings",
      title: "Puxa Ficha",
      subtitle: "Ordenacoes publicas por metricas estruturadas de candidatos de 2026.",
    })
  }

  const dataset = (await getRankingDataResource(slug, "Presidente")).data
  const leader = dataset.entries[0]
  const subtitle = leader
    ? `#1: ${leader.candidato.nome_urna} · ${formatRankingMetricValue(leader.metricValue, definition.metricUnit)}`
    : definition.contextExplanation

  return buildEditorialOg({
    eyebrow: definition.eyebrow,
    title: definition.title,
    subtitle,
    meta: `${definition.metricLabel} · Puxa Ficha`,
  })
}
