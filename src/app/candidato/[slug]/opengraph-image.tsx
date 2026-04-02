import { getCandidatoBySlugResource } from "@/lib/api"
import { buildEditorialOg, ogContentType, ogSize } from "@/lib/og"

export const size = ogSize
export const contentType = ogContentType

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ficha = (await getCandidatoBySlugResource(slug)).data

  if (!ficha) {
    return buildEditorialOg({
      eyebrow: "Ficha de candidato",
      title: "Puxa Ficha",
      subtitle:
        "Consulta publica sobre candidatos de 2026 com patrimonio, processos, votacoes e contexto editorial.",
    })
  }

  return buildEditorialOg({
    eyebrow: `${ficha.partido_sigla} · ${ficha.cargo_disputado}`,
    title: ficha.nome_urna,
    subtitle:
      ficha.biografia?.slice(0, 170) ??
      `Ficha completa de ${ficha.nome_urna} com patrimonio, processos, votacoes e financiamento.`,
    meta: "Puxa Ficha",
  })
}
