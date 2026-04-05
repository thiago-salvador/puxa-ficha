import { getCandidatoBySlugResource } from "@/lib/api"
import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"
import { buildTimelineEvents } from "@/lib/timeline-utils"

export const size = ogSize
export const contentType = ogContentType

export default async function TimelineOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ficha = (await getCandidatoBySlugResource(slug)).data

  if (!ficha) {
    return buildEditorialOg({
      eyebrow: "Timeline",
      title: "Puxa Ficha",
      subtitle: "Linha do tempo de candidatos com dados publicos (TSE, Camara, Senado).",
    })
  }

  const n = buildTimelineEvents(ficha).length
  const countLabel = n === 1 ? "1 evento no eixo" : `${n} eventos no eixo`

  return buildEditorialOg({
    eyebrow: `Timeline · ${ficha.partido_sigla} · ${ficha.cargo_disputado}`,
    title: ficha.nome_urna,
    subtitle: `${countLabel}. Patrimonio, votacoes, processos, cargos, partidos e gastos na mesma linha.`,
    meta: "Puxa Ficha · Linha do tempo",
  })
}
